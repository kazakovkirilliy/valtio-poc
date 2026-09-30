import type { ProductStore } from "../stores/productStore.ts";
import { subscribeKey } from "valtio/utils";
import type { DealStore } from "../stores/dealStore.ts";
import type { $ZodIssue } from "zod/v4/core";
import type { ZodType } from "zod";

const isSameIssues = (a?: $ZodIssue[], b?: $ZodIssue[]) => {
  if (!a && !b?.length) return true;
  if (!a || !b) return false;
  return (
    a.length === b.length && a.every((i, idx) => i.message === b[idx].message)
  );
};

export const validateFieldFactory = (
  $dealStore: DealStore,
  productStore: ProductStore,
  productId: string,
) => {
  /**
   * Per-field validation: runs once now, then only when this product's own
   * field changes — never on unrelated deal or product changes.
   */
  const validateField = <K extends keyof ProductStore>(
    field: K,
    schema: ZodType,
  ) => {
    const fullPath = `products.${productId}.${field}`.replaceAll(".", "_");

    const validate = () => {
      const result = schema.safeParse(productStore[field]);
      const issues = result.success ? [] : result.error.issues;

      // Only write if the content actually changed — avoids new
      // array identities and needless notifications.
      const prev = $dealStore.validationErrors[fullPath];
      if (isSameIssues(prev, issues)) return;

      $dealStore.validationErrors[fullPath] = issues;
    };

    validate();
    subscribeKey(productStore, field, validate, true);
  };

  return validateField;
};
