import { subscribeKey } from "valtio/utils";
import type { DealStore } from "./dealStore.ts";
import type { $ZodIssue } from "zod/v4/core";
import type { ZodType } from "zod";
import { resolveParent, type LeafPath } from "../lib/path.ts";

/** `validationErrors` key for a field path relative to the deal. */
export const toValidationKey = (path: string) => path.replaceAll(".", "_");

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
  productPath: string, // the product's path from the deal
) => {
  /**
   * Per-field validation: runs once now, then only when this product's own
   * field changes — never on unrelated deal or product changes.
   * `path` is relative to the product and may be nested (`a.b.c`); the
   * subscription is placed on the nested proxy that owns the leaf key.
   * Returns the unsubscribe.
   */
  const validateField = (path: LeafPath<T>, schema: ZodType) => {
    const fullPath = toValidationKey(`${productPath}.${path}`);
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

/** Drops every validation entry under `path` (e.g. a removed group). */
export const clearValidationErrors = ($dealStore: DealStore, path: string) => {
  const prefix = toValidationKey(`${path}.`);
  for (const key of Object.keys($dealStore.validationErrors)) {
    if (key.startsWith(prefix)) delete $dealStore.validationErrors[key];
  }
};
