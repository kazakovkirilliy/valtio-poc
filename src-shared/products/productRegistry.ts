import type { ZodType } from "zod";
import type { DealFieldsState } from "../dealFields.ts";
import type { ProductFieldId } from "../fields.ts";
import { getValueByPath } from "../lib/path.ts";
import { type AverageProductStore, averageProduct } from "./averageProduct.ts";
import type { CrossFieldRule, DerivedField, ProductUi } from "./productDefinition.ts";
import { type VanillaProductStore, vanillaProduct } from "./vanillaProduct.ts";

/**
 * Every product type a group can hold. Adding a product type: declare it
 * (`defineProduct`) and list it here; every app builds it generically.
 */
export const productDefinitions = {
  VanillaProduct: vanillaProduct,
  AverageProduct: averageProduct,
};

export type ProductType = keyof typeof productDefinitions;
export type AnyProductStore = VanillaProductStore | AverageProductStore;
export type ProductData = AnyProductStore["data"];
export type { ProductUi };

/** A definition as generic code sees it: string paths, functions over any product's data. */
export type GenericProductDefinition = {
  label: string;
  fieldPaths: Record<ProductFieldId, string>;
  schemas: Record<ProductFieldId, ZodType>;
  rules?: Partial<Record<ProductFieldId, readonly CrossFieldRule<ProductData>[]>>;
  derived?: Partial<Record<ProductFieldId, DerivedField<ProductData>>>;
  createData: (deal: DealFieldsState) => ProductData;
};

export const definitionOf = (productType: ProductType) =>
  productDefinitions[productType] as unknown as GenericProductDefinition;

/** Works on any product data (proxy, observable or plain). */
export const productTypeOf = (data: { productType: string }) =>
  data.productType as ProductType;

export const readField = (data: ProductData, fieldId: ProductFieldId) =>
  getValueByPath(data, definitionOf(data.productType).fieldPaths[fieldId]);

/** Derived fields are read-only. */
export const isReadOnly = (definition: GenericProductDefinition, fieldId: ProductFieldId) =>
  Boolean(definition.derived?.[fieldId]);

/** The derived fields that depend on a field: recompute them when it changes. */
export const derivedFieldsOf = (
  definition: GenericProductDefinition,
  changed: ProductFieldId,
) =>
  (Object.entries(definition.derived ?? {}) as [ProductFieldId, DerivedField<ProductData>][])
    .filter(([, derived]) => derived.dependsOn.includes(changed));
