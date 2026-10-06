import { type PrimitiveAtom, type Setter, type WritableAtom, atom } from "jotai/vanilla";
import {
  type Option,
  type OptionsSource,
  type OptionsState,
  optionsFailed,
  optionsKey,
  optionsLoaded,
  optionsLoading,
} from "@shared/options/optionsSource.ts";

/** What the caller does with options once they arrive: set in the batch that stores them. */
type OnLoaded = (set: Setter, options: readonly Option[]) => void;

export type OptionsStore = {
  /** Loaded options per source and parameter (see `optionsKey`). */
  byKeyAtom: PrimitiveAtom<Record<string, OptionsState>>;
  /** Loads in flight. */
  pendingAtom: PrimitiveAtom<number>;
  /**
   * (Re)loads. A write atom, not an action: a deal action sets it with its
   * own `set`, so the load is counted (`pendingAtom`) in that action's batch.
   * Once the options arrive, their state, `onLoaded` and the count are one
   * batch: nothing sees the load done before the caller has used them.
   */
  loadAtom: WritableAtom<null, [source: OptionsSource, param: string, onLoaded?: OnLoaded], Promise<void>>;
};

/** Updates one key's state; an unchanged state keeps the record: no notification. */
const setOptionsState = (set: Setter, key: string, next: (previous: OptionsState | undefined) => OptionsState) =>
  set(optionsStore.byKeyAtom, (byKey) => {
    const state = next(byKey[key]);
    return state === byKey[key] ? byKey : { ...byKey, [key]: state };
  });

/** A load done (`options`: none when it failed), in one batch. */
const loadDoneAtom = atom(null, (_get, set, key: string, options?: readonly Option[], onLoaded?: OnLoaded) => {
  setOptionsState(set, key, (previous) => (options ? optionsLoaded(previous, options) : optionsFailed(previous)));
  if (options) onLoaded?.(set, options);
  set(optionsStore.pendingAtom, (pending) => pending - 1);
});

/** Every async dropdown's options, shared by every deal. */
export const optionsStore: OptionsStore = {
  byKeyAtom: atom<Record<string, OptionsState>>({}),
  pendingAtom: atom(0),
  loadAtom: atom(null, async (_get, set, source: OptionsSource, param: string, onLoaded?: OnLoaded) => {
    const key = optionsKey(source, param);
    setOptionsState(set, key, optionsLoading);
    set(optionsStore.pendingAtom, (pending) => pending + 1);
    const options = await source.load(param).catch(() => undefined);
    // after an `await`, each `set` is a batch of its own: one write atom makes the rest one
    set(loadDoneAtom, key, options, onLoaded);
  }),
};
