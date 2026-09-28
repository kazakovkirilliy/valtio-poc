import type { ProductStore } from "../stores/productStore.ts";
import { effect } from "valtio-reactive";
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
   * Per-field validation: each effect reads ONE field and writes ONE key.
   * A keystroke in `strike` never touches the currency issue entries.
   */
  const validateField = <K extends keyof ProductStore>(
    field: K,
    schema: ZodType,
  ) => {
    effect(() => {
      const fullPath = `products.${productId}.${field}`.replaceAll(".", "_");

      const value = productStore[field]; // narrow read
      const result = schema.safeParse(value);
      const issues = result.success ? [] : result.error.issues;

      // Only write if the content actually changed — avoids new
      // array identities on unrelated reruns of the effect.
      const prev = $dealStore.validationErrors[fullPath];
      if (isSameIssues(prev, issues)) return;

      $dealStore.validationErrors[fullPath] = issues;
    });
  };

  return validateField;
};
