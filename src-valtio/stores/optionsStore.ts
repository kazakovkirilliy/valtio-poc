import { proxy } from "valtio";
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
  actions: {
    load(source: OptionsSource, param: string): Promise<readonly Option[] | undefined>;
  };
};

/** Every async dropdown's options, shared by every deal. */
export const optionsStore = proxy<OptionsStore>({
  byKey: {},
  actions: {
    /** (Re)loads; resolves with the options, or `undefined` on failure. */
    async load(source, param) {
      const key = optionsKey(source, param);
      const { byKey } = optionsStore;
      // unchanged states are written back as the same object: no notification
      byKey[key] = optionsLoading(byKey[key]);
      try {
        const options = await source.load(param);
        byKey[key] = optionsLoaded(byKey[key], options);
        return options;
      } catch {
        byKey[key] = optionsFailed(byKey[key]);
        return undefined;
      }
    },
  },
});
