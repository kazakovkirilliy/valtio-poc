import { types } from "mobx-state-tree";
import {
  type Option,
  type OptionsSource,
  type OptionsState,
  optionsFailed,
  optionsKey,
  optionsLoaded,
  optionsLoading,
} from "@shared/options/optionsSource.ts";

/** Every async dropdown's options, shared by every deal. */
const Options = types
  .model("Options", {
    /** Loaded options per source and parameter (see `optionsKey`). */
    byKey: types.frozen<Record<string, OptionsState>>({}),
    /** Loads in flight. */
    pending: 0,
  })
  .actions((self) => {
    /** Unchanged states come back as the same object: nothing to write, nothing notified. */
    const setState = (key: string, state: OptionsState) => {
      if (self.byKey[key] !== state) self.byKey = { ...self.byKey, [key]: state };
    };
    return {
      started(key: string) {
        setState(key, optionsLoading(self.byKey[key]));
        self.pending += 1;
      },
      finished(key: string, state: OptionsState) {
        setState(key, state);
        self.pending -= 1;
      },
    };
  })
  .actions((self) => ({
    /** (Re)loads; resolves with the options, or `undefined` on failure. */
    async load(source: OptionsSource, param: string): Promise<readonly Option[] | undefined> {
      const key = optionsKey(source, param);
      self.started(key);
      try {
        const options = await source.load(param);
        // after an `await` we're outside the action: changes go through actions
        self.finished(key, optionsLoaded(self.byKey[key], options));
        return options;
      } catch {
        self.finished(key, optionsFailed(self.byKey[key]));
        return undefined;
      }
    },
  }));

export const optionsStore = Options.create();
