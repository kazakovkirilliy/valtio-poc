import { type DealStore } from "./dealStore.ts";
import { type ProductStore, createProductStore } from "./productStore.ts";
import {
  type VanillaProductStore,
  createVanillaProductStore,
} from "./vanillaProductStore.ts";

export type AnyProductStore = ProductStore | VanillaProductStore;

type ProductFactory = (
  $dealStore: DealStore,
  productId: string,
) => AnyProductStore;

/**
 * Every product type the deal can hold. Adding a product type means adding
 * its factory and label here, and its column in `Deal.tsx`.
 */
export const productFactories = {
  Product: createProductStore,
  VanillaProduct: createVanillaProductStore,
} satisfies Record<string, ProductFactory>;

export type ProductType = keyof typeof productFactories;

export const productTypeLabels: Record<ProductType, string> = {
  Product: "Product",
  VanillaProduct: "Vanilla Product",
};

export const productTypes = Object.keys(productFactories) as ProductType[];

/** Works on both proxies and snapshots; reads only the discriminator. */
export const getProductType = (
  product:
    | Pick<ProductStore, "productType">
    | { data: Pick<VanillaProductStore["data"], "productType"> },
): ProductType =>
  "data" in product ? product.data.productType : product.productType;
