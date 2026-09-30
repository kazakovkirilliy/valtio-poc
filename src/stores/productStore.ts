import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";
import { type DealStore } from "./dealStore.ts";
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
 *
 * Syncs use `subscribeKey` rather than `valtio-reactive` effects: an effect
 * that reads the deal subscribes to the whole deal, and every write re-checks
 * every product's effects (nested, synchronously) — cost that grows much
 * faster than the product count. A key subscription does one cheap compare.
 * Sync notification (`true`) keeps all sides consistent within the keystroke.
 */
export const createProductStore = (
  $dealStore: DealStore,
  productId: string,
) => {
  const productStore = proxy<ProductStore>({
    productNotionalCcy: $dealStore.notionalCcy,
    productPremiumCcy: $dealStore.premiumCcy,
    strike: "",
  });

  /**
   * Two-way Sync
   * Valtio ignores same-value writes, so the echo back stops after one hop.
   */
  subscribeKey(
    $dealStore,
    "premiumCcy",
    (value) => (productStore.productPremiumCcy = value),
    true,
  );
  subscribeKey(
    productStore,
    "productPremiumCcy",
    (value) => ($dealStore.premiumCcy = value),
    true,
  );

  /**
   * Two-way Sync
   */
  subscribeKey(
    $dealStore,
    "notionalCcy",
    (value) => (productStore.productNotionalCcy = value),
    true,
  );
  subscribeKey(
    productStore,
    "productNotionalCcy",
    (value) => ($dealStore.notionalCcy = value),
    true,
  );

  /**
   * One-way Sync
   * Consume the broadcast command — each product maps it
   * to its own strike field name.
   * Sync notification is required: the broadcast is set and reset in one tick.
   */
  subscribeKey(
    $dealStore,
    "strike",
    (broadcast) => {
      if (broadcast === undefined) return;
      productStore.strike = broadcast; // <- local name, e.g. productStore.strikeLevel
    },
    true,
  );

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
