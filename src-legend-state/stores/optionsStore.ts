import { batch, observable } from "@legendapp/state";
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
};

/** Every async dropdown's options, shared by every deal. */
export const options$ = observable<OptionsStoreState>({ byKey: {}, pending: 0 });

/** (Re)loads; resolves with the options, or `undefined` on failure. */
export const loadOptions = async (
  source: OptionsSource,
  param: string,
): Promise<readonly Option[] | undefined> => {
  const entry$ = options$.byKey[optionsKey(source, param)];
  // unchanged states come back as the same object: nothing to write
  const update = (next: OptionsState) => {
    if (next !== entry$.peek()) entry$.set(next);
  };
  batch(() => {
    options$.pending.set((pending) => pending + 1);
    update(optionsLoading(entry$.peek()));
  });
  try {
    const options = await source.load(param);
    batch(() => {
      update(optionsLoaded(entry$.peek(), options));
      options$.pending.set((pending) => pending - 1);
    });
    return options;
  } catch {
    batch(() => {
      update(optionsFailed(entry$.peek()));
      options$.pending.set((pending) => pending - 1);
    });
    return undefined;
  }
};
