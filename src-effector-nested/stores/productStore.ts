import type { DealFieldsState } from "@shared/dealFields.ts";
import {
  type ProductFieldId,
  asyncOptionFields,
  existsForParam,
  fieldExists,
  fieldsAbsentFor,
} from "@shared/fields.ts";
import { removeIn, setIn } from "@shared/lib/path.ts";
import { uuid } from "@shared/lib/uuid.ts";
import type { CellWrite } from "@shared/grid/gridSource.ts";
import { type Option, optionsKey, reconcileOption } from "@shared/options/optionsSource.ts";
import {
  type AnyProductStore,
  type ProductType,
  type ProductUi,
  definitionOf,
  derivedFieldsOf,
  isReadOnly,
  productTypeOf,
  readField,
} from "@shared/products/productRegistry.ts";
import { type FieldIssues, productIssues } from "@shared/validation.ts";
import type { OptionsRequest } from "./optionsStore.ts";

/**
 * Products as plain, immutable data, driven by their declarations
 * (`@shared/products`): nothing here is specific to a product type.
 */

/** A product in the deal's `$products` store: its declared shape, plus an id. */
export type ProductState = AnyProductStore & { id: string };

const definitionOfProduct = (product: ProductState) =>
  definitionOf(productTypeOf(product.data));

/**
 * A new product of `productType`, or a copy of `source` (same type). Called
 * when a group is built; the id is new either way.
 */
export const createProduct = (
  productType: ProductType,
  defaults: DealFieldsState,
  ui: ProductUi,
  source?: ProductState,
) =>
  ({
    id: uuid(),
    ui,
    // plain data, so a clone is a deep copy (NaN and all)
    data: source ? structuredClone(source.data) : definitionOf(productType).createData(defaults),
  }) as ProductState;

export const readProductField = (product: ProductState, fieldId: ProductFieldId) =>
  readField(product.data, fieldId);

/**
 * The product with one field written, the fields derived from it recomputed
 * and the fields that stop existing removed; the same object if nothing
 * changed. Only the objects along the path are copied. Derived fields, and
 * fields the product doesn't have (e.g. a fixing source without Cash), are
 * never written directly.
 */
export const setProductField = (
  product: ProductState,
  fieldId: ProductFieldId,
  value: unknown,
): ProductState => {
  const definition = definitionOfProduct(product);
  if (isReadOnly(definition, fieldId)) return product;
  if (!fieldExists(fieldId, (id) => readProductField(product, id))) return product;
  let data = setIn(product.data, definition.fieldPaths[fieldId], value);
  if (data === product.data) return product;
  for (const [derivedId, derived] of derivedFieldsOf(definition, fieldId)) {
    data = setIn(data, definition.fieldPaths[derivedId], derived.compute(data));
  }
  for (const absentId of fieldsAbsentFor(fieldId, value)) {
    data = removeIn(data, definition.fieldPaths[absentId]);
  }
  return { ...product, data } as ProductState;
};

/**
 * Issues of every product. Product data is immutable, so results are cached
 * by data identity: only products that actually changed are re-validated.
 */
const issuesCache = new WeakMap<object, FieldIssues>();
export const validateProducts = (
  products: readonly ProductState[],
): Record<string, FieldIssues> =>
  Object.fromEntries(
    products.map((product) => {
      let issues = issuesCache.get(product.data);
      if (!issues) {
        issues = productIssues(definitionOfProduct(product), product.data);
        issuesCache.set(product.data, issues);
      }
      return [product.id, issues];
    }),
  );

// --- async options: each depends on another field of the same product

/**
 * The options the products' async fields need, one request per source and
 * parameter; none for a field a product doesn't have.
 */
export const optionsRequestsOf = (products: readonly ProductState[]): OptionsRequest[] => {
  const requests = new Map<string, OptionsRequest>();
  for (const product of products) {
    for (const { options } of asyncOptionFields) {
      const param = String(readProductField(product, options.dependsOn));
      if (!existsForParam(options, param)) continue;
      const request = { source: options.source, param };
      requests.set(optionsKey(request.source, request.param), request);
    }
  }
  return [...requests.values()];
};

/**
 * The options to reload when `fieldId` takes `value` (nothing depends on it,
 * or the dependent field doesn't exist for that value: none).
 */
export const optionsRequestsFor = (fieldId: ProductFieldId, value: unknown): OptionsRequest[] =>
  asyncOptionFields
    .filter(({ options }) => options.dependsOn === fieldId && existsForParam(options, value))
    .map(({ options }) => ({ source: options.source, param: String(value) }));

/** The options to reload after a batch of writes, one request per source and parameter. */
export const optionsRequestsForWrites = (writes: readonly CellWrite[]): OptionsRequest[] => {
  const requests = new Map<string, OptionsRequest>();
  for (const { fieldId, value } of writes) {
    for (const request of optionsRequestsFor(fieldId as ProductFieldId, value)) {
      requests.set(optionsKey(request.source, request.param), request);
    }
  }
  return [...requests.values()];
};

/**
 * Options arrived: a product still on that parameter keeps its value if it
 * is an option, else takes the first. A product that has since moved to
 * another parameter is left alone (a stale response).
 */
export const reconcileProductOptions = (
  product: ProductState,
  { source, param }: OptionsRequest,
  options: readonly Option[],
) =>
  asyncOptionFields.reduce(
    (next, { fieldId, options: field }) =>
      field.source === source && readProductField(next, field.dependsOn) === param
        ? setProductField(next, fieldId, reconcileOption(readProductField(next, fieldId), options))
        : next,
    product,
  );
