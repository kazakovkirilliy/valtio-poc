import { fileURLToPath } from "node:url";
import v8 from "node:v8";
import vm from "node:vm";
import { vi } from "vitest";

/** Absolute path from the repo root (for vi.doMock). */
export const at = (relative: string) => fileURLToPath(new URL(`../../../${relative}`, import.meta.url));

export type DevtoolsMessage = { type: string; state?: string; payload?: { type: string } };

/** One instance the app opened in the (fake) Redux DevTools extension. */
export type FakeConnection = {
  name: string;
  options: Record<string, unknown>;
  /** Each `init` state, serialized the way the extension would (with the instance's replacer). */
  inits: string[];
  /** Each `send`: the action and the state after it, serialized. */
  sends: { action: { type: string }; state: string }[];
  listeners: ((message: DevtoolsMessage) => void)[];
  /** Dispatches a monitor message (e.g. JUMP_TO_STATE with a recorded state). */
  dispatch(type: string, state?: string): void;
};

/**
 * A fake `window.__REDUX_DEVTOOLS_EXTENSION__`: records every connection, its
 * init and sends (serialized with the connection's `serialize.replacer`, as
 * the real extension does), and lets a test dispatch monitor messages.
 */
export const installFakeExtension = (extraWindow: Record<string, unknown> = {}) => {
  const connections: FakeConnection[] = [];
  const serialize = (options: Record<string, unknown>, state: unknown) => {
    const replacer = (options.serialize as { replacer?: (key: string, value: unknown) => unknown } | undefined)?.replacer;
    return JSON.stringify(state, replacer as never) ?? "null";
  };
  const extension = {
    connect(options: Record<string, unknown>) {
      const connection: FakeConnection = {
        name: String(options.name ?? ""),
        options,
        inits: [],
        sends: [],
        listeners: [],
        dispatch(type, state) {
          for (const listener of [...connection.listeners]) {
            listener({ type: "DISPATCH", state, payload: { type } });
          }
        },
      };
      connections.push(connection);
      return {
        init: (state: unknown) => connection.inits.push(serialize(options, state)),
        send: (action: { type: string }, state: unknown) =>
          connection.sends.push({ action, state: serialize(options, state) }),
        subscribe: (listener: (message: DevtoolsMessage) => void) => {
          connection.listeners.push(listener);
          return () => {};
        },
        unsubscribe: () => {},
      };
    },
  };
  const window = { __REDUX_DEVTOOLS_EXTENSION__: extension, location: { search: "" }, ...extraWindow };
  // valtio-auto-persist checks `obj instanceof Element` whenever `window` exists
  vi.stubGlobal("Element", class {});
  vi.stubGlobal("window", window);
  vi.stubGlobal("location", window.location);
  return { connections, window, byName: (name: string) => connections.find((c) => c.name === name) };
};

/** A Map-backed localStorage on globalThis (and on `window` when stubbed). */
export const installLocalStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  const storage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  };
  vi.stubGlobal("localStorage", storage);
  const win = (globalThis as unknown as { window?: Record<string, unknown> }).window;
  if (win) win.localStorage = storage;
  return { storage, data };
};

let gcFn: (() => void) | undefined;
/** A real GC (V8's `gc`, exposed at runtime). */
export const forceGc = async () => {
  if (!gcFn) {
    v8.setFlagsFromString("--expose-gc");
    gcFn = vm.runInNewContext("gc") as () => void;
  }
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gcFn();
  }
};
