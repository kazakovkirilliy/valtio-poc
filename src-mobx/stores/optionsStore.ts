import { observable, runInAction } from "mobx";
import {
  type Option,
  type OptionsSource,
  type OptionsState,
  optionsFailed,
  optionsKey,
  optionsLoaded,
  optionsLoading,
} from "@shared/options/optionsSource.ts";

export type OptionsStore = {
  /** Loaded options per source and parameter (see `optionsKey`). */
  byKey: Record<string, OptionsState>;
  /** Loads in flight. */
  pending: number;
  /** (Re)loads; resolves with the options, or `undefined` on failure. */
  load(source: OptionsSource, param: string): Promise<readonly Option[] | undefined>;
};

/** Every async dropdown's options, shared by every deal. */
export const optionsStore: OptionsStore = observable<OptionsStore>(
  {
    byKey: {},
    pending: 0,
    async load(source, param) {
      const key = optionsKey(source, param);
      optionsStore.pending += 1;
      // unchanged states are written back as the same object: no reaction
      optionsStore.byKey[key] = optionsLoading(optionsStore.byKey[key]);
      try {
        const options = await source.load(param);
        // after an `await` we're outside the action: wrap the writes
        runInAction(() => {
          optionsStore.byKey[key] = optionsLoaded(optionsStore.byKey[key], options);
          optionsStore.pending -= 1;
        });
        return options;
      } catch {
        runInAction(() => {
          optionsStore.byKey[key] = optionsFailed(optionsStore.byKey[key]);
          optionsStore.pending -= 1;
        });
        return undefined;
      }
    },
  },
  {},
  { autoBind: true },
);
