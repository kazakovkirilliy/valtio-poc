import { type DealStore } from "./dealStore.ts";
import {
  type VanillaProductStore,
  createVanillaProductStore,
} from "./vanillaProductStore.ts";
import {
  type AverageProductStore,
  createAverageProductStore,
} from "./averageProductStore.ts";

export type AnyProductStore = VanillaProductStore | AverageProductStore;

export type ProductHandle = {
  productStore: AnyProductStore;
  /** Drops the product's subscriptions; call when it leaves the deal. */
  dispose(): void;
};

type ProductFactory = (
  $dealStore: DealStore,
  productPath: string,
  initial?: never,
) => ProductHandle;

/**
 * Every product type a group can hold. Adding a product type means adding
 * its factory and label here, and its column in `GroupColumn.tsx`.
 */
export const productFactories = {
  VanillaProduct: createVanillaProductStore,
  AverageProduct: createAverageProductStore,
} satisfies Record<string, ProductFactory>;

export type ProductType = keyof typeof productFactories;

export const productTypeLabels: Record<ProductType, string> = {
  VanillaProduct: "Vanilla Product",
  AverageProduct: "Average Product",
};

/** Works on both proxies and snapshots; reads only the discriminator. */
export const getProductType = (product: {
  data: { productType: ProductType };
}): ProductType => product.data.productType;

/**
 * Creates a product of `productType` at `productPath` (from the deal).
 * `initial` seeds a clone and must be a plain copy of the same type.
 */
export const createProduct = (
  productType: ProductType,
  $dealStore: DealStore,
  productPath: string,
  initial?: AnyProductStore,
): ProductHandle => {
  const factory = productFactories[productType] as (
    $dealStore: DealStore,
    productPath: string,
    initial?: AnyProductStore,
  ) => ProductHandle;
  return factory($dealStore, productPath, initial);
};
