import type { DealFieldsState } from "@shared/dealFields.ts";
import {
  type AnyProductStore,
  type ProductData,
  type ProductType,
  type ProductUi,
  definitionOf,
} from "@shared/products/productRegistry.ts";

/**
 * Product factory: a product as plain data, from its declaration
 * (`@shared/products`), held by its deal's store. Writes don't happen here:
 * the deal routes every write by path and replaces the data it changes
 * (`writePaths`). Nothing to watch either: its issues follow from its data
 * (`issuesOf`, `validation.ts`).
 *
 * `initialData`: a clone's source data, shared as is: it is never changed
 * in place.
 */
export const createProductStore = (
  dealFields: DealFieldsState,
  productType: ProductType,
  ui: ProductUi,
  initialData?: ProductData,
) =>
  ({
    ui,
    data: initialData ?? definitionOf(productType).createData(dealFields),
  }) as AnyProductStore;
