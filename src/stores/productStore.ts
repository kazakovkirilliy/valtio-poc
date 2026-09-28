import { proxy } from "valtio";
import { type DealStore } from "./dealStore.ts";
import { effect } from "valtio-reactive";
import { z } from "zod";
import type { $ZodIssue } from "zod/v4/core";

export type ProductStore = {
  productNotionalCcy: string;
  productPremiumCcy: string;
  strike: string;
};

const ccySchema = z.string().max(6, "Must be at most 6 characters");
const strikeSchema = z.string().max(3, "Must be at most 3 characters");

/**
 * Product factory.
 */
export const createProductStore = (
  $dealStore: DealStore,
  productId: string,
) => {
  const productStore = proxy<ProductStore>({
    productNotionalCcy: "",
    productPremiumCcy: "",
    strike: "",
  });

  /**
   * Two-way Sync
   */
  effect(() => {
    console.log("Premium Changed (Deal)");
    productStore.productPremiumCcy = $dealStore.premiumCcy;
  });
  effect(() => {
    console.log("Premium Changed (Product)");
    $dealStore.premiumCcy = productStore.productPremiumCcy;
  });

  /**
   * Two-way Sync
   */
  effect(() => {
    console.log("Notional Changed (Deal)");
    productStore.productNotionalCcy = $dealStore.notionalCcy;
  });
  effect(() => {
    console.log("Notional Changed (Product)");
    $dealStore.notionalCcy = productStore.productNotionalCcy;
  });

  /**
   * One-way Sync
   * Consume the broadcast command — each product maps it
   * to its own strike field name.
   */
  effect(() => {
    const broadcast = $dealStore.strike;
    if (broadcast === undefined) return;
    productStore.strike = broadcast; // <- local name, e.g. productStore.strikeLevel
  });

  const isSameIssues = (a?: $ZodIssue[], b?: $ZodIssue[]) => {
    if (!a && !b?.length) return true;
    if (!a || !b) return false;
    return (
      a.length === b.length && a.every((i, idx) => i.message === b[idx].message)
    );
  };
  /**
   * Per-field validation: each effect reads ONE field and writes ONE key.
   * A keystroke in `strike` never touches the currency issue entries.
   */
  const validateField = <K extends keyof ProductStore>(
    field: K,
    schema: z.ZodType,
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

  validateField("productNotionalCcy", ccySchema);
  validateField("productPremiumCcy", ccySchema);
  validateField("strike", strikeSchema);

  return productStore;
};
