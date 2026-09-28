import { proxy } from "valtio";
import { type DealStore } from "./dealStore.ts";
import { effect } from "valtio-reactive";
import { z } from "zod";
import { validateFieldFactory } from "../utils/validateField.ts";

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

  const validateField = validateFieldFactory(
    $dealStore,
    productStore,
    productId,
  );

  validateField("productNotionalCcy", ccySchema);
  validateField("productPremiumCcy", ccySchema);
  validateField("strike", strikeSchema);

  return productStore;
};
