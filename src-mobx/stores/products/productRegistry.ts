import { toJS } from "mobx";
import type { ProductOwner } from "../dealFields.ts";
import {
  type VanillaProduct,
  createVanillaProduct,
} from "./vanillaProductStore.ts";
import {
  type AverageProduct,
  createAverageProduct,
} from "./averageProductStore.ts";

export type AnyProduct = VanillaProduct | AverageProduct;

type ProductUi = { title: string; index: number };

/**
 * Every product type a group can hold. Each product's store module owns its
 * shape, field paths, schemas and derived fields; this only lists them.
 * Adding a product type means adding its store module and an entry here.
 */
export const productDefinitions = {
  VanillaProduct: { label: "Vanilla Product", create: createVanillaProduct },
  AverageProduct: { label: "Average Product", create: createAverageProduct },
} satisfies Record<
  string,
  {
    label: string;
    create: (owner: ProductOwner, ui: ProductUi, source?: never) => AnyProduct;
  }
>;

export type ProductType = keyof typeof productDefinitions;

/** A new product of `productType`, or a copy of `source` (same type). */
export const createProduct = (
  productType: ProductType,
  owner: ProductOwner,
  ui: ProductUi,
  source?: AnyProduct,
): AnyProduct => {
  const create = productDefinitions[productType].create as (
    owner: ProductOwner,
    ui: ProductUi,
    source?: AnyProduct["data"],
  ) => AnyProduct;
  // plain deep copy: the clone gets its own observables and computeds
  return create(owner, ui, source && toJS(source.data));
};
