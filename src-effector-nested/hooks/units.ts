import type { EventCallable, Store } from "effector";
import { useUnit } from "effector-react";

/**
 * Intent-named wrappers over `useUnit`, which does two different jobs
 * depending on what it is given. Both keep its subscription, scope binding
 * and typing.
 */

/** The store's current value; re-renders the component when it changes. */
export const useValue = <T>(store: Store<T>): T => useUnit(store);

/** A callable for the event (an action), bound to the active scope. */
export const useAction = <T>(event: EventCallable<T>) => useUnit(event);
