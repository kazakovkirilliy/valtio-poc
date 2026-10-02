import type { VanillaProductStore } from "./vanillaProductStore.ts";
import {
  type ProductOwner,
  createOptionsCommon,
  createSharedData,
} from "./optionProduct.ts";

/**
 * Exactly a Vanilla product, except its common block is named `avroCommon`.
 * Derived from the Vanilla type so the two can never drift apart.
 */
export type AverageProductStore = {
  ui: VanillaProductStore["ui"];
  data: Omit<VanillaProductStore["data"], "productType" | "optionsCommon"> & {
    productType: "AverageProduct";
    avroCommon: VanillaProductStore["data"]["optionsCommon"];
  };
};

export type AverageProductData = AverageProductStore["data"];

export const createAverageData = (owner: ProductOwner): AverageProductData => ({
  productType: "AverageProduct",
  ...createSharedData(),
  avroCommon: createOptionsCommon(owner),
});
