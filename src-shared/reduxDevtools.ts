/**
 * The Redux DevTools browser extension, for the apps whose library has no
 * adapter of its own (dev builds only: each app's `devtools.ts`). Also
 * `?debug` in the URL: every reported action is logged to the console.
 */

/** A message from the extension's monitor: `state` is the JSON of the state to go to. */
export type DevtoolsMessage = { type: string; state?: string; payload?: { type: string } };

/** One instance in the extension (the part of `connect()`'s result these apps use). */
export type DevtoolsConnection = {
  init(state: unknown): void;
  send(action: { type: string; args?: readonly unknown[] }, state: unknown): void;
  subscribe(listener: (message: DevtoolsMessage) => void): unknown;
};

type DevtoolsExtension = { connect(options: { name: string }): DevtoolsConnection };

const extension = (window as Window & { __REDUX_DEVTOOLS_EXTENSION__?: DevtoolsExtension }).__REDUX_DEVTOOLS_EXTENSION__;
if (!extension) {
  console.info(
    "[devtools] Redux DevTools extension not found on this page: install it, or allow it on this site, then reload.",
  );
}

/** A new instance in the extension, shown under `name`; none without the extension. */
export const connectExtension = (name: string) => extension?.connect({ name });

export const isDebugEnabled = new URLSearchParams(location.search).has("debug");

/**
 * Reports a store's actions: to the extension, each with the store's state
 * after it, and to the console with `?debug`. Returns the reporter. With
 * `applyState`, the extension can also move the store: jump to a past state,
 * reset, commit, roll back.
 */
export const createActionLog = ({
  name,
  getState,
  applyState,
}: {
  name: string;
  getState: () => unknown;
  applyState?: (state: unknown) => void;
}) => {
  const connection = connectExtension(name);
  let initialState = getState();
  // the store's own actions while the extension moves it aren't new history
  let isApplying = false;
  const apply = (state: unknown) => {
    isApplying = true;
    try {
      applyState?.(state);
    } finally {
      isApplying = false;
    }
  };

  connection?.init(initialState);
  if (connection && applyState) {
    connection.subscribe((message) => {
      if (message.type !== "DISPATCH" || !message.payload) return;
      switch (message.payload.type) {
        case "RESET":
          apply(initialState);
          connection.init(initialState);
          return;
        case "COMMIT":
          initialState = getState();
          connection.init(initialState);
          return;
        case "ROLLBACK": {
          const state = JSON.parse(message.state ?? "null");
          apply(state);
          connection.init(state);
          return;
        }
        case "JUMP_TO_STATE":
        case "JUMP_TO_ACTION":
          apply(JSON.parse(message.state ?? "null"));
          return;
      }
    });
  }

  return (type: string, args: readonly unknown[]) => {
    if (isApplying) return;
    connection?.send({ type, args }, getState());
    if (isDebugEnabled) console.log(`[${name}] ${type}`, ...args);
  };
};
