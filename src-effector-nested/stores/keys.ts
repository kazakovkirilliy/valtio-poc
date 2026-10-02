import { type Store, createStore, sample as connect } from "effector";

/** Same keys, in the same order. */
export const sameKeys = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key, i) => key === b[i]);

/**
 * The keys of a store keyed by id, in order (= display order). A new array
 * only when the keys change, so a list that renders them doesn't re-render
 * when an item inside changes.
 */
export const keysOf = <T extends object>($source: Store<T>): Store<string[]> => {
  const $keys = createStore(Object.keys($source.getState()), {
    updateFilter: (next, current) => !sameKeys(next, current),
  });
  connect({ clock: $source, fn: (source) => Object.keys(source), target: $keys });
  return $keys;
};
