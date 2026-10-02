import { subscribeKey } from "valtio/utils";
import { resolveParent } from "../lib/path.ts";
import { type DealBroadcastKey, dealBroadcastKeys } from "./dealBroadcasts.ts";
import type { DealStore } from "./dealStore.ts";

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

/**
 * Consumes every deal broadcast into the product field that `paths` maps it
 * to (a path from the product). The product decides the mapping; this only
 * wires it. Sync notification is required: a broadcast is set and reset in
 * one tick. Returns a single unsubscribe.
 */
export const subscribeDealBroadcasts = (
  $dealStore: DealStore,
  productStore: object,
  paths: Record<DealBroadcastKey, string>,
) => {
  const unsubscribes = dealBroadcastKeys.map((dealKey) => {
    const { parent, key } = resolveParent(productStore, paths[dealKey]);
    if (!parent) throw new Error(`No field for broadcast "${dealKey}"`);
    return subscribeDealKey($dealStore, dealKey, (broadcast) => {
      if (broadcast === undefined) return;
      parent[key] = broadcast;
    });
  });
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
};
