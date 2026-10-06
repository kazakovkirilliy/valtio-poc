import { createEvent, createStore } from "effector";
import { keyval } from "@effector/model";
import type { Option } from "@shared/options/optionsSource.ts";
import type { ProductData, ProductUi } from "@shared/products/productRegistry.ts";
import {
  type OptionsRequest,
  type ProductWrite,
  definitionOfData,
  planProductWrites,
  reconcileWrites,
} from "@shared/products/productWrites.ts";
import { type FieldIssues, productIssues } from "@shared/validation.ts";

const noIssues: FieldIssues = {};

/**
 * A product, as one item of an `@effector/model` collection: its own data
 * store, its issues derived from it, and its own api events. A write to one
 * product touches that product's stores only (by the shared rules); the
 * collection's `$items` view is rebuilt from them, keeping every other item
 * as the same object.
 */
export const productsModel = keyval(() => {
  const $id = createStore("");
  const $ui = createStore<ProductUi>({ title: "", index: 0 });
  const $data = createStore<ProductData | null>(null);
  // re-validated only when this product's data changes
  const $issues = $data.map((data) => (data ? productIssues(definitionOfData(data), data) : noIssues));

  /** Writes into this product, in order. */
  const write = createEvent<readonly ProductWrite[]>();
  /** Options arrived: keep its fields that use them valid. */
  const reconcileOptions = createEvent<{ request: OptionsRequest; options: readonly Option[] }>();
  $data
    .on(write, (data, writes) => (data ? planProductWrites(data, writes).data : data))
    .on(reconcileOptions, (data, { request, options }) =>
      data ? planProductWrites(data, reconcileWrites(data, request, options)).data : data,
    );

  return {
    key: "id",
    state: { id: $id, ui: $ui, data: $data, issues: $issues },
    api: { write, reconcileOptions },
  };
});
