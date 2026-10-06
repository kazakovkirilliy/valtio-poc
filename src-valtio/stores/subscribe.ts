import { subscribeKey } from "valtio/utils";
import { resolveParent } from "@shared/lib/path.ts";

/**
 * Sync `subscribeKey` on the nested proxy that owns `path`, so only changes
 * to that one field notify. Bound to the nested objects as they are now:
 * write leaf values, never replace those objects wholesale.
 */
export const subscribePath = (
  target: object,
  path: string,
  callback: (value: unknown) => void,
) => {
  const { parent, key } = resolveParent(target, path);
  if (!parent) throw new Error(`No field at "${path}"`);
  return subscribeKey(parent, key, callback, true);
};
