import { subscribeKey } from "valtio/utils";
import type { DealStore } from "../stores/dealStore.ts";
import type { $ZodIssue } from "zod/v4/core";
import type { ZodType } from "zod";
import { resolveParent, toValidationKey, type LeafPath } from "./utils.ts";

const isSameIssues = (a?: $ZodIssue[], b?: $ZodIssue[]) => {
  if (!a && !b?.length) return true;
  if (!a || !b) return false;
  return (
    a.length === b.length && a.every((i, idx) => i.message === b[idx].message)
  );
};

export const validateFieldFactory = <T extends object>(
  $dealStore: DealStore,
  productStore: T,
  productId: string,
) => {
  /**
   * Per-field validation: runs once now, then only when this product's own
   * field changes — never on unrelated deal or product changes.
   * `path` is relative to the product and may be nested (`a.b.c`); the
   * subscription is placed on the nested proxy that owns the leaf key.
   */
  const validateField = (path: LeafPath<T>, schema: ZodType) => {
    const fullPath = toValidationKey(`products.${productId}.${path}`);
    const { parent, key } = resolveParent(productStore, path);
    if (!parent) throw new Error(`validateField: no parent for "${path}"`);

    const validate = () => {
      const result = schema.safeParse(parent[key]);
      const issues = result.success ? [] : result.error.issues;

      // Only write if the content actually changed — avoids new
      // array identities and needless notifications.
      const prev = $dealStore.validationErrors[fullPath];
      if (isSameIssues(prev, issues)) return;

      $dealStore.validationErrors[fullPath] = issues;
    };

    validate();
    return subscribeKey(parent, key, validate, true);
  };

  return validateField;
};
