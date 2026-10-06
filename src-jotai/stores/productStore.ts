import { type Atom, type PrimitiveAtom, atom } from "jotai/vanilla";
import type { DealFieldsState } from "@shared/dealFields.ts";
import {
  type ProductData,
  type ProductType,
  type ProductUi,
  definitionOf,
} from "@shared/products/productRegistry.ts";
import { type FieldIssues, productIssues } from "@shared/validation.ts";

export type ProductStore = {
  ui: ProductUi;
  /** Never changed in place: a write replaces it, copying only the changed path. */
  dataAtom: PrimitiveAtom<ProductData>;
  /** Every field's issues (fields without any left out). */
  issuesAtom: Atom<FieldIssues>;
};

/**
 * Product factory: a product's atoms from its declaration
 * (`@shared/products`). Writes don't happen here: the deal routes every
 * write by path and sets the new data (`writePaths`). Validation is a
 * derived atom: it re-runs only when this product's data changes.
 *
 * `initialData`: another product's data, to clone. Shared, not copied:
 * nothing changes it in place.
 */
export const createProductStore = (
  dealFields: DealFieldsState,
  productType: ProductType,
  ui: ProductUi,
  initialData?: ProductData,
): ProductStore => {
  const definition = definitionOf(productType);
  const dataAtom = atom(initialData ?? definition.createData(dealFields));
  return {
    ui,
    dataAtom,
    issuesAtom: atom((get) => productIssues(definition, get(dataAtom))),
  };
};
