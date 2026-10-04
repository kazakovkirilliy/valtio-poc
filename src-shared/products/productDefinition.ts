import type { ZodType } from "zod";
import { type BoolLogic, mapBoolLogicPaths } from "../boolLogic.ts";
import type { DealFieldsState } from "../dealFields.ts";
import { type ProductFieldId, fields as gridRows } from "../fields.ts";
import type { DeepPath, LeafPath } from "../lib/path.ts";
import { DATA, GROUPS, PRODUCTS } from "../paths.ts";

export type ProductUi = { title: string; index: number };

/**
 * A field computed from others. Read-only, unless it has `write`: a write to
 * it then writes the field it returns instead, and it is recomputed from that.
 */
export type DerivedField<Data> = {
  dependsOn: readonly ProductFieldId[];
  compute: (data: Data) => unknown;
  write?: (value: unknown) => { fieldId: ProductFieldId; value: unknown };
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

/** Where any product's data lives in the deal: `$GROUP_ID` and `$PRODUCT_ID` stand for its own ids. */
export const PRODUCT_DATA_PREFIX = `${GROUPS}.$GROUP_ID.${PRODUCTS}.$PRODUCT_ID.${DATA}.`;

/** A path into a product's data, written from the deal's root as the original app's configs write it. */
export type ProductPath<Path extends string> = `groups.$GROUP_ID.products.$PRODUCT_ID.data.${Path}`;

/**
 * One grid row of a product, in the original app's config shape
 * (`FxVanilla.ts`). Every path is checked against the product's data type.
 */
export type ProductFieldConfig<Data> = {
  /** The original app's cell component; unused here: the grid picks the editor per row (`fields.ts`). */
  type?: string;
  /** The value the cell shows and edits. */
  props: { path: ProductPath<LeafPath<Data>> };
  /** The grid row it fills. */
  position: { field: ProductFieldId };
  /** Shown, and validated, only while the condition holds; its data is kept either way. */
  visibility?: { if: BoolLogic<ProductPath<DeepPath<Data>>> };
  /** The schema the value at the path must pass, checked only while the field is visible. */
  validation?: { schema: readonly [path: ProductPath<DeepPath<Data>>, schema: ZodType] };
};

/**
 * Everything specific to one product type: its fields as configs, plus the
 * rules, derived fields and initial data that sit beside them. Each app's
 * generic product factory turns it into a live product.
 */
export type ProductDefinition<Data extends { productType: string }> = {
  label: string;
  fields: readonly ProductFieldConfig<Data>[];
  rules?: Partial<Record<ProductFieldId, readonly CrossFieldRule<Data>[]>>;
  derived?: Partial<Record<ProductFieldId, DerivedField<Data>>>;
  /** A new product's data, starting from the deal's values. */
  createData: (deal: DealFieldsState) => Data;
};

/** A field's schema, and the path (in the product's data) of the value it checks. */
export type FieldValidation = { path: string; schema: ZodType };

const productFieldIds = gridRows.map(({ id }) => id).filter((id): id is ProductFieldId => id !== "spotStream");

/** A config path, relative to the product's data. */
const toDataPath = (path: string) => {
  if (!path.startsWith(PRODUCT_DATA_PREFIX)) {
    throw new Error(`"${path}" isn't in a product's data (${PRODUCT_DATA_PREFIX}…)`);
  }
  return path.slice(PRODUCT_DATA_PREFIX.length);
};

/**
 * A product definition, compiled from its field configs into what the
 * stores and the grid read: each row's path, schema and visibility, relative
 * to the product's data. A config that can't work (a path outside the
 * product, a row listed twice or missing) throws, so it fails on load.
 */
export const defineProduct = <Data extends { productType: string }>({
  fields,
  ...definition
}: ProductDefinition<Data>) => {
  const fieldPaths = {} as Record<ProductFieldId, LeafPath<Data>>;
  const validation: Partial<Record<ProductFieldId, FieldValidation>> = {};
  const visibility: Partial<Record<ProductFieldId, BoolLogic>> = {};
  for (const field of fields) {
    const id = field.position.field;
    if (id in fieldPaths) throw new Error(`${definition.label}: row "${id}" is listed twice`);
    fieldPaths[id] = toDataPath(field.props.path) as LeafPath<Data>;
    if (field.validation) {
      const [path, schema] = field.validation.schema;
      validation[id] = { path: toDataPath(path), schema };
    }
    if (field.visibility) visibility[id] = mapBoolLogicPaths(field.visibility.if, toDataPath);
  }
  const missing = productFieldIds.filter((id) => !(id in fieldPaths));
  if (missing.length) throw new Error(`${definition.label}: no field for ${missing.join(", ")}`);
  return { ...definition, fieldPaths, validation, visibility };
};
