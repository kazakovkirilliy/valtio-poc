import { useMemo } from "react";
import { proxy } from "valtio";
import type { $ZodIssue } from "zod/v4/core";
import { useDealStore } from "../contexts/DealStoreProvider.tsx";
import { resolveParent, toValidationKey } from "../utils/utils.ts";
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
