import { createStore } from "zustand/vanilla";
import { devtools } from "zustand/middleware";
import {
  type Option,
  type OptionsSource,
  type OptionsState,
  optionsFailed,
  optionsKey,
  optionsLoaded,
  optionsLoading,
} from "@shared/options/optionsSource.ts";

export type OptionsStoreState = {
  /** Loaded options per source and parameter (see `optionsKey`). */
  byKey: Record<string, OptionsState>;
  /** Loads in flight. */
  pending: number;
  actions: {
    load(source: OptionsSource, param: string, onLoaded?: (options: readonly Option[]) => void): Promise<void>;
  };
};

/** `byKey` with a key's new state; an unchanged state keeps the same `byKey`: nothing repaints. */
const withEntry = (byKey: Record<string, OptionsState>, key: string, next: OptionsState) =>
  byKey[key] === next ? byKey : { ...byKey, [key]: next };

/** Every async dropdown's options, shared by every deal. */
export const optionsStore = createStore<OptionsStoreState>()(
  devtools(
    (set) => ({
      byKey: {},
      pending: 0,
      actions: {
        /**
         * (Re)loads. `onLoaded` gets the options before they count as loaded
         * (not on failure): what it writes lands while the load is still
         * pending, so whatever waits for it (autocalc) sees the result.
         */
        async load(source, param, onLoaded) {
          const key = optionsKey(source, param);
          // the entry and the count in one `set`: one notification
          set(
            ({ byKey, pending }) => ({ byKey: withEntry(byKey, key, optionsLoading(byKey[key])), pending: pending + 1 }),
            false,
            "load",
          );
          try {
            const options = await source.load(param);
            onLoaded?.(options);
            set(
              ({ byKey, pending }) => ({ byKey: withEntry(byKey, key, optionsLoaded(byKey[key], options)), pending: pending - 1 }),
              false,
              "loaded",
            );
          } catch {
            set(
              ({ byKey, pending }) => ({ byKey: withEntry(byKey, key, optionsFailed(byKey[key])), pending: pending - 1 }),
              false,
              "loadFailed",
            );
          }
        },
      },
    }),
    {
      name: "Options (Zustand)",
      enabled: import.meta.env.DEV,
      // time travel sets the state back from its JSON: leave the actions out of it, so they're kept
      serialize: { replacer: (key: string, value: unknown) => (key === "actions" ? undefined : value) },
    },
  ),
);
