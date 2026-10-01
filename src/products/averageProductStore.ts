import { type DealStore } from "../deal/dealStore.ts";
import { type VanillaProductStore } from "./vanillaProductStore.ts";
import {
  createOptionProduct,
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

/**
 * Average product factory — syncs, broadcasts and validation live in
 * `createOptionProduct`. `initial` (a plain deep copy) seeds a clone.
 */
export const createAverageProductStore = (
  $dealStore: DealStore,
  productPath: string,
  initial?: AverageProductStore,
) =>
  createOptionProduct(
    $dealStore,
    productPath,
    initial ?? {
      ui: { title: "", index: 0 }, // set by the group on creation
      data: {
        productType: "AverageProduct",
        ...createSharedData(),
        avroCommon: createOptionsCommon($dealStore),
      },
    },
  );
