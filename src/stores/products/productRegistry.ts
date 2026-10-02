import { type DealStore } from "../dealStore.ts";
import type { ProductFieldId } from "../fields.ts";
import {
  type VanillaProductStore,
  createVanillaProductStore,
  vanillaFieldPaths,
  vanillaReadOnlyFields,
} from "./vanillaProductStore.ts";
import {
  type AverageProductStore,
  averageFieldPaths,
  averageReadOnlyFields,
  createAverageProductStore,
} from "./averageProductStore.ts";

export type AnyProductStore = VanillaProductStore | AverageProductStore;

export type ProductHandle = {
  productStore: AnyProductStore;
  /** Drops the product's subscriptions; call when it leaves the deal. */
  dispose(): void;
};

type ProductDefinition = {
  label: string;
  create: (
    $dealStore: DealStore,
    productPath: string,
    initial?: never,
  ) => ProductHandle;
  /** Where each field row lives in this product (paths from the product). */
  fieldPaths: Partial<Record<ProductFieldId, string>>;
  readOnlyFields: readonly ProductFieldId[];
};

/**
 * Every product type a group can hold. Each product's store module owns its
 * shape, field paths, schemas and syncs; this only lists them. Adding a
 * product type means adding its store module and an entry here.
 */
export const productDefinitions = {
  VanillaProduct: {
    label: "Vanilla Product",
    create: createVanillaProductStore,
    fieldPaths: vanillaFieldPaths,
    readOnlyFields: vanillaReadOnlyFields,
  },
  AverageProduct: {
    label: "Average Product",
    create: createAverageProductStore,
    fieldPaths: averageFieldPaths,
    readOnlyFields: averageReadOnlyFields,
  },
} satisfies Record<string, ProductDefinition>;

export type ProductType = keyof typeof productDefinitions;

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
  const create = productDefinitions[productType].create as (
    $dealStore: DealStore,
    productPath: string,
    initial?: AnyProductStore,
  ) => ProductHandle;
  return create($dealStore, productPath, initial);
};
