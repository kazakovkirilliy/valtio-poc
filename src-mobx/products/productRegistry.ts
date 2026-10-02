import { toJS } from "mobx";
import {
  type OptionProductData,
  type ProductOwner,
  type ProductUi,
  OptionProduct,
} from "./optionProduct.ts";
import { createVanillaData } from "./vanillaProductStore.ts";
import { createAverageData } from "./averageProductStore.ts";

/**
 * Every product type a group can hold. Adding a product type means adding
 * its data shape and an entry here.
 */
export const productDefinitions = {
  VanillaProduct: { label: "Vanilla Product", createData: createVanillaData },
  AverageProduct: { label: "Average Product", createData: createAverageData },
} satisfies Record<
  string,
  { label: string; createData: (owner: ProductOwner) => OptionProductData }
>;

export type ProductType = keyof typeof productDefinitions;

/** A new product of `productType`, or a copy of `source` (same type). */
export const createProduct = (
  productType: ProductType,
  owner: ProductOwner,
  ui: ProductUi,
  source?: OptionProduct,
) =>
  new OptionProduct(
    // plain deep copy: the clone gets its own observables and computeds
    source ? toJS(source.data) : productDefinitions[productType].createData(owner),
    owner,
    ui,
  );
