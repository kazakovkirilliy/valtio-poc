import { type PrimitiveAtom, type WritableAtom, atom } from "jotai/vanilla";
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
  byKeyAtom: PrimitiveAtom<Record<string, OptionsState>>;
  /** Loads in flight. */
  pendingAtom: PrimitiveAtom<number>;
  /**
   * (Re)loads; resolves with the options, or `undefined` on failure. A write
   * atom, not an action: a deal action sets it with its own `set`, so the
   * load is counted (`pendingAtom`) in that action's batch.
   */
  loadAtom: WritableAtom<null, [source: OptionsSource, param: string], Promise<readonly Option[] | undefined>>;
};

/** Every async dropdown's options, shared by every deal. */
export const optionsStore: OptionsStore = {
  byKeyAtom: atom<Record<string, OptionsState>>({}),
  pendingAtom: atom(0),
  loadAtom: atom(null, async (_get, set, source: OptionsSource, param: string) => {
    const key = optionsKey(source, param);
    // unchanged states come back as the same object: the record is kept, no notification
    const setState = (next: (previous: OptionsState | undefined) => OptionsState) =>
      set(optionsStore.byKeyAtom, (byKey) => {
        const state = next(byKey[key]);
        return state === byKey[key] ? byKey : { ...byKey, [key]: state };
      });
    setState(optionsLoading);
    set(optionsStore.pendingAtom, (pending) => pending + 1);
    try {
      // after an `await`, each `set` is a batch of its own
      const options = await source.load(param);
      setState((previous) => optionsLoaded(previous, options));
      return options;
    } catch {
      setState(optionsFailed);
      return undefined;
    } finally {
      set(optionsStore.pendingAtom, (pending) => pending - 1);
    }
  }),
};
