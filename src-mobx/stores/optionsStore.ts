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
  /** (Re)loads; resolves with the options, or `undefined` on failure. */
  load(source: OptionsSource, param: string): Promise<readonly Option[] | undefined>;
};

/** Every async dropdown's options, shared by every deal. */
export const optionsStore: OptionsStore = observable<OptionsStore>(
  {
    byKey: {},
    async load(source, param) {
      const key = optionsKey(source, param);
      // unchanged states are written back as the same object: no reaction
      optionsStore.byKey[key] = optionsLoading(optionsStore.byKey[key]);
      try {
        const options = await source.load(param);
        // after an `await` we're outside the action: wrap the writes
        runInAction(() => {
          optionsStore.byKey[key] = optionsLoaded(optionsStore.byKey[key], options);
        });
        return options;
      } catch {
        runInAction(() => {
          optionsStore.byKey[key] = optionsFailed(optionsStore.byKey[key]);
        });
        return undefined;
      }
    },
  },
  {},
  { autoBind: true },
);
