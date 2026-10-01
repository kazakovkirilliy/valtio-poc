import { subscribeKey } from "valtio/utils";
import type { DealStore } from "../stores/dealStore.ts";

type Listener = (value: unknown) => void;

const fanouts = new WeakMap<DealStore, Map<keyof DealStore, Set<Listener>>>();

/**
 * Sync `subscribeKey` on a deal key, shared by all of the deal's products.
 *
 * Every product write bubbles up to the deal and notifies every deal-level
 * listener. With one listener per product per key, a single product write
 * cost O(products) and a deal → all-products sync cost O(products²).
 * Here each key has exactly one deal-level listener that fans out to the
 * products, so the deal's listener count no longer grows with products.
 */
export const subscribeDealKey = <K extends keyof DealStore>(
  $dealStore: DealStore,
  key: K,
  callback: (value: DealStore[K]) => void,
) => {
  let byKey = fanouts.get($dealStore);
  if (!byKey) {
    byKey = new Map();
    fanouts.set($dealStore, byKey);
  }

  let listeners = byKey.get(key);
  if (!listeners) {
    const set = new Set<Listener>();
    listeners = set;
    byKey.set(key, set);
    subscribeKey(
      $dealStore,
      key,
      (value) => set.forEach((listener) => listener(value)),
      true,
    );
  }

  const listener = callback as Listener;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
