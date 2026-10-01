import { useCallback, useMemo, useSyncExternalStore } from "react";
import { subscribe } from "valtio";
import { subscribeKey } from "valtio/utils";

/**
 * Reads one key of one proxy. Unlike `useSnapshot` on a whole store, it is
 * only notified by changes inside `proxyObject` (not the entire store tree),
 * does no snapshotting, and re-renders only when the value itself changes.
 * Bound to the proxy passed in — the parent object must not be replaced.
 */
export const useProxyValue = <T extends object, K extends keyof T>(
  proxyObject: T,
  key: K,
): T[K] => {
  const subscribeToKey = useCallback(
    (onChange: () => void) => subscribeKey(proxyObject, key, onChange),
    [proxyObject, key],
  );
  return useSyncExternalStore(subscribeToKey, () => proxyObject[key]);
};

/**
 * Own keys of a proxy; re-renders only when keys are added or removed,
 * not when values inside the entries change.
 */
export const useProxyKeys = (proxyObject: object): string[] => {
  const subscribeToProxy = useCallback(
    (onChange: () => void) => subscribe(proxyObject, onChange),
    [proxyObject],
  );
  // a string is compared by value, so unchanged keys never re-render
  const signature = useSyncExternalStore(subscribeToProxy, () =>
    Object.keys(proxyObject).join(","),
  );
  return useMemo(() => (signature ? signature.split(",") : []), [signature]);
};
