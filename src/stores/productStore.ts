import { proxy } from "valtio";
import { type DealStore } from "./dealStore.ts";
import { effect } from "valtio-reactive";
import { z } from "zod";

export type ProductStore = {
  productNotionalCcy: string;
  productPremiumCcy: string;
  strike: string;
};

const ccySchema = z.string().max(6, "Must be at most 6 characters");

const ProductStoreSchema = z.object({
  productNotionalCcy: ccySchema,
  productPremiumCcy: ccySchema,
  strike: z.string(),
});

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
   * Reactive validation: runs whenever ANY product field changes,
   * no matter who changed it or how.
   */
  effect(() => {
    const result = ProductStoreSchema.safeParse({
      productNotionalCcy: productStore.productNotionalCcy,
      productPremiumCcy: productStore.productPremiumCcy,
      strike: productStore.strike,
    });

    const issuesByField: DealStore["validationErrors"] = {};

    if (result.success) {
      $dealStore.validationErrors = {}; // all valid
      return;
    }

    for (const issue of result.error.issues) {
      const field = `products.${productId}.${String(issue.path[0])}`.replaceAll(
        ".",
        "_",
      );
      (issuesByField[field] ??= []).push(issue);
    }
    $dealStore.validationErrors = issuesByField;
  });

  return productStore;
};
