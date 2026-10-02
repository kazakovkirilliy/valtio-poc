import { useCallback, useMemo } from "react";
import { proxy } from "valtio";
import type { $ZodIssue } from "zod/v4/core";
import { useDealStore } from "../components/providers/DealStoreProvider.tsx";
import { isEmptyBroadcast } from "@shared/dealFields.ts";
import { resolveParent } from "@shared/lib/path.ts";
import { toValidationKey } from "../stores/validation.ts";
import { useProxyValue } from "./useProxyValue.ts";

// stand-in parent for a path that no longer exists (e.g. a removed product)
const missingParent = proxy<Record<string, unknown>>({});

/**
 * Value at a deal path, subscribed on the nested proxy that owns it: typing
 * in one product's `base` never notifies inputs bound to other objects.
 */
export const useDealValue = (path: string): unknown => {
  const dealStore = useDealStore();
  const { parent, key } = useMemo(
    () => resolveParent(dealStore, path),
    [dealStore, path],
  );
  // a removed product's fields can render once more before they unmount
  return useProxyValue(parent ?? missingParent, key);
};

/**
 * Validation issues for a deal path. Subscribes to `validationErrors` only,
 * which changes just when some field's issues change — not on every keystroke.
 */
export const useValidationError = (path: string) => {
  const { validationErrors } = useDealStore();
  const issues = useProxyValue(validationErrors, toValidationKey(path)) as
    | $ZodIssue[]
    | undefined;

  return { hasError: !!issues?.length, issues };
};

/**
 * Commits a value to a deal path. A broadcast field holds nothing: the value
 * is written (reaching every product) and reset in the same tick.
 */
export const useDealCommit = (path: string, isBroadcasting = false) => {
  const { actions } = useDealStore();
  return useCallback(
    (value: unknown) => {
      if (!isBroadcasting) return actions.setValueByPath(path, value);
      if (isEmptyBroadcast(value)) return; // nothing to broadcast
      actions.setValueByPath(path, value);
      actions.setValueByPath(path, undefined);
    },
    [actions, path, isBroadcasting],
  );
};
