import type { EventCallable, Store } from "effector";
import { useStoreMap, useUnit } from "effector-react";

/**
 * Intent-named wrappers over `useUnit`, which does two different jobs
 * depending on what it is given. Both keep its subscription, scope binding
 * and typing.
 */

/** The store's current value; re-renders the component when it changes. */
export const useValue = <T>(store: Store<T>): T => useUnit(store);

/** A callable for the event (an action), bound to the active scope. */
export const useAction = <T>(event: EventCallable<T>) => useUnit(event);

const sameKeys = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key, i) => key === b[i]);

/**
 * The ids of an object keyed by id, in order (= display order): the store's
 * state, or the part `select` picks (`deps`: what `select` reads besides the
 * state). Re-renders only when the ids change — `Object.keys` returns a new
 * array on every update, so a plain selector would re-render on every edit
 * to any item inside.
 */
export const useKeys = <State, Deps extends readonly unknown[] = []>(
  store: Store<State>,
  select: (state: State) => object | undefined = (state) => state as object,
  deps = [] as unknown as Deps,
): string[] =>
  useStoreMap({
    store,
    keys: deps,
    fn: (state) => Object.keys(select(state) ?? {}),
    updateFilter: (next, current) => !sameKeys(next, current),
  });
