import type { ZodType } from "zod";
import type { DealFieldsState } from "../dealFields.ts";
import type { ProductFieldId } from "../fields.ts";
import type { LeafPath } from "../lib/path.ts";

export type ProductUi = { title: string; index: number };

/** A field computed from others; read-only in the UI, never written by the user. */
export type DerivedField<Data> = {
  dependsOn: readonly ProductFieldId[];
  compute: (data: Data) => unknown;
};

/**
 * A rule across fields, reported on the field it is listed under.
 * `dependsOn` names the other fields it reads, so it re-runs when they change.
 */
export type CrossFieldRule<Data> = {
  dependsOn: readonly ProductFieldId[];
  message: string;
  isValid: (data: Data) => boolean;
};

/**
 * Everything specific to one product type, as plain declarations in the
 * product's own names. Each app's generic product factory turns it into a
 * live product: syncs, broadcasts, derived and async fields, validation.
 */
export type ProductDefinition<Data extends { productType: string }> = {
  label: string;
  /** Where each field row lives in this product's data. */
  fieldPaths: Record<ProductFieldId, LeafPath<Data>>;
  schemas: Record<ProductFieldId, ZodType>;
  rules?: Partial<Record<ProductFieldId, readonly CrossFieldRule<Data>[]>>;
  derived?: Partial<Record<ProductFieldId, DerivedField<Data>>>;
  /** A new product's data, starting from the deal's values. */
  createData: (deal: DealFieldsState) => Data;
};

export const defineProduct = <Data extends { productType: string }>(
  definition: ProductDefinition<Data>,
) => definition;
