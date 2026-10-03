import { proxy } from "valtio";
import type { ProductFieldId } from "@shared/fields.ts";
import {
  type AnyProductStore,
  type ProductData,
  type ProductType,
  type ProductUi,
  definitionOf,
} from "@shared/products/productRegistry.ts";
import type { DealStore } from "./dealStore.ts";
import { watchFieldValidation } from "./validation.ts";

/**
 * Product factory: a live valtio product from its declaration
 * (`@shared/products`). Writes don't happen here: the deal routes every
 * write by path and applies it as plain proxy assignments (`writePaths`).
 * What stays reactive is validation: each field is re-checked, on the
 * nested proxy that owns it, whenever it or a field its rules read changes.
 *
 * `productPath`: the product's path from the deal (validation keys).
 * `initialData`: a plain deep copy, to clone. `dispose` drops every
 * subscription.
 */
export const createProductStore = (
  $dealStore: DealStore,
  productType: ProductType,
  productPath: string,
  ui: ProductUi,
  initialData?: ProductData,
) => {
  const definition = definitionOf(productType);
  const productStore = proxy<AnyProductStore>({
    ui,
    data: initialData ?? definition.createData($dealStore),
  } as AnyProductStore);

  const stops = (Object.keys(definition.schemas) as ProductFieldId[]).map((fieldId) =>
    watchFieldValidation($dealStore, definition, productStore.data, productPath, fieldId),
  );

  return {
    productStore,
    dispose: () => stops.forEach((stop) => stop()),
  };
};
