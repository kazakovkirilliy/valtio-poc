import { getValueByPath } from "../../lib/path.ts";
import { uuid } from "../../lib/uuid.ts";
import type { DealFieldsState } from "../dealFields.ts";
import type { ProductFieldId } from "../fields.ts";
import type { FieldIssues } from "../validation.ts";
import {
  type VanillaProductStore,
  createVanillaData,
  setVanillaField,
  validateVanilla,
  vanillaFieldPaths,
  vanillaReadOnlyFields,
} from "./vanillaProductStore.ts";
import {
  type AverageProductStore,
  averageFieldPaths,
  averageReadOnlyFields,
  createAverageData,
  setAverageField,
  validateAverage,
} from "./averageProductStore.ts";

/** A product in the deal's `$products` store: its own shape, plus an id. */
export type ProductState = (VanillaProductStore | AverageProductStore) & {
  id: string;
};
type ProductData = ProductState["data"];
type ProductUi = ProductState["ui"];

type ProductDefinition<Data> = {
  label: string;
  createData: (deal: DealFieldsState) => Data;
  /** Where each field row lives in this product's data. */
  fieldPaths: Partial<Record<ProductFieldId, string>>;
  readOnlyFields: readonly ProductFieldId[];
  setField: (data: Data, fieldId: ProductFieldId, value: unknown) => Data;
  validate: (data: Data) => FieldIssues;
};

/**
 * Every product type a group can hold. Each product's module owns its shape,
 * field paths, schemas, rules and derived fields as pure functions; this
 * only lists them. Adding a product type means adding its module and an
 * entry here.
 */
export const productDefinitions = {
  VanillaProduct: {
    label: "Vanilla Product",
    createData: createVanillaData,
    fieldPaths: vanillaFieldPaths,
    readOnlyFields: vanillaReadOnlyFields,
    setField: setVanillaField,
    validate: validateVanilla,
  },
  AverageProduct: {
    label: "Average Product",
    createData: createAverageData,
    fieldPaths: averageFieldPaths,
    readOnlyFields: averageReadOnlyFields,
    setField: setAverageField,
    validate: validateAverage,
  },
} satisfies {
  VanillaProduct: ProductDefinition<VanillaProductStore["data"]>;
  AverageProduct: ProductDefinition<AverageProductStore["data"]>;
};

export type ProductType = keyof typeof productDefinitions;

/** The product's own definition, typed for its data. */
export const definitionOf = (product: ProductState) =>
  productDefinitions[product.data.productType] as ProductDefinition<ProductData>;

/**
 * A new product of `productType`, or a copy of `source` (same type). Called
 * when a group is built; the id is new either way.
 */
export const createProduct = (
  productType: ProductType,
  deal: DealFieldsState,
  ui: ProductUi,
  source?: ProductState,
) =>
  ({
    id: uuid(),
    ui,
    // plain data, so a clone is a deep copy (NaN and all)
    data: source
      ? structuredClone(source.data)
      : productDefinitions[productType].createData(deal),
  }) as ProductState;

export const readProductField = (product: ProductState, fieldId: ProductFieldId) => {
  const path = definitionOf(product).fieldPaths[fieldId];
  return path === undefined ? undefined : getValueByPath(product.data, path);
};

/** The product with one field written; the same object if nothing changed. */
export const setProductField = (
  product: ProductState,
  fieldId: ProductFieldId,
  value: unknown,
): ProductState => {
  const data = definitionOf(product).setField(product.data, fieldId, value);
  return data === product.data ? product : ({ ...product, data } as ProductState);
};

/**
 * Issues of every product. Product data is immutable, so results are cached
 * by data identity: only products that actually changed are re-validated.
 */
const issuesCache = new WeakMap<object, FieldIssues>();
export const validateProducts = (
  products: Record<string, ProductState>,
): Record<string, FieldIssues> =>
  Object.fromEntries(
    Object.values(products).map((product) => {
      let issues = issuesCache.get(product.data);
      if (!issues) {
        issues = definitionOf(product).validate(product.data);
        issuesCache.set(product.data, issues);
      }
      return [product.id, issues];
    }),
  );
