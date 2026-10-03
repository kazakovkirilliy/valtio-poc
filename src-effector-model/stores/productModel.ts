import { createEvent, createStore } from "effector";
import { keyval } from "@effector/model";
import { type ProductFieldId, asyncOptionFields, fieldExists, fieldsAbsentFor } from "@shared/fields.ts";
import { getValueByPath, removeIn, setIn } from "@shared/lib/path.ts";
import { type Option, reconcileOption } from "@shared/options/optionsSource.ts";
import {
  type GenericProductDefinition,
  type ProductData,
  type ProductUi,
  definitionOf,
  derivedFieldsOf,
  isReadOnly,
  productTypeOf,
} from "@shared/products/productRegistry.ts";
import { type FieldIssues, productIssues } from "@shared/validation.ts";
import type { OptionsRequest } from "./optionsStore.ts";

/**
 * A product, as one item of an `@effector/model` collection: its own data
 * store, its issues derived from it, and its own api events. A write to one
 * product touches that product's stores only; the collection's `$items`
 * view is rebuilt from them, keeping every other item as the same object.
 */

/** A write into a product: by path in its data (as the app being migrated writes), or by field. */
export type ProductWrite = { path: string; value: unknown } | { fieldId: ProductFieldId; value: unknown };

export const definitionOfData = (data: ProductData) => definitionOf(productTypeOf(data));

const fieldsByPath = new Map<GenericProductDefinition, Map<string, ProductFieldId>>();
/** The field a path in a product's data belongs to, if it is a declared field. */
export const fieldAtPath = (definition: GenericProductDefinition, path: string) => {
  if (!fieldsByPath.has(definition)) {
    const byPath = new Map<string, ProductFieldId>();
    for (const [fieldId, fieldPath] of Object.entries(definition.fieldPaths)) {
      byPath.set(fieldPath, fieldId as ProductFieldId);
    }
    fieldsByPath.set(definition, byPath);
  }
  return fieldsByPath.get(definition)!.get(path);
};

/**
 * One field written, with its rules: derived fields are never written and
 * are recomputed from what they depend on; a field the product doesn't have
 * (a fixing source without Cash) isn't written, and fields that stop existing
 * are removed. Only the objects along the path are copied.
 */
const writeField = (data: ProductData, fieldId: ProductFieldId, value: unknown): ProductData => {
  const definition = definitionOfData(data);
  const read = (id: ProductFieldId) => getValueByPath(data, definition.fieldPaths[id]);
  if (isReadOnly(definition, fieldId) || !fieldExists(fieldId, read)) return data;
  let next = setIn(data, definition.fieldPaths[fieldId], value);
  if (next === data) return data;
  for (const [derivedId, derived] of derivedFieldsOf(definition, fieldId)) {
    next = setIn(next, definition.fieldPaths[derivedId], derived.compute(next));
  }
  for (const absentId of fieldsAbsentFor(fieldId, value)) {
    next = removeIn(next, definition.fieldPaths[absentId]);
  }
  return next;
};

/** A write by field, or by path: a path that is a declared field gets its rules; any other is written as is. */
export const applyProductWrite = (data: ProductData, write: ProductWrite): ProductData => {
  if ("fieldId" in write) return writeField(data, write.fieldId, write.value);
  const fieldId = fieldAtPath(definitionOfData(data), write.path);
  return fieldId ? writeField(data, fieldId, write.value) : setIn(data, write.path, write.value);
};

/** Options arrived: a product still on that parameter keeps its value if it's an option, else takes the first. */
const reconcileData = (data: ProductData, { source, param }: OptionsRequest, options: readonly Option[]) => {
  const definition = definitionOfData(data);
  const read = (id: ProductFieldId) => getValueByPath(data, definition.fieldPaths[id]);
  return asyncOptionFields.reduce(
    (next, { fieldId, options: field }) =>
      field.source === source && read(field.dependsOn) === param
        ? writeField(next, fieldId, reconcileOption(read(fieldId), options))
        : next,
    data,
  );
};

const noIssues: FieldIssues = {};

/** The product collection's item: created per product by `keyval`. */
export const productsModel = keyval(() => {
  const $id = createStore("");
  const $ui = createStore<ProductUi>({ title: "", index: 0 });
  const $data = createStore<ProductData | null>(null);
  // re-validated only when this product's data changes
  const $issues = $data.map((data) => (data ? productIssues(definitionOfData(data), data) : noIssues));

  /** Writes into this product, in order. */
  const write = createEvent<readonly ProductWrite[]>();
  const reconcileOptions = createEvent<{ request: OptionsRequest; options: readonly Option[] }>();
  $data
    .on(write, (data, writes) => (data ? writes.reduce(applyProductWrite, data) : data))
    .on(reconcileOptions, (data, { request, options }) => (data ? reconcileData(data, request, options) : data));

  return {
    key: "id",
    state: { id: $id, ui: $ui, data: $data, issues: $issues },
    api: { write, reconcileOptions },
  };
});
