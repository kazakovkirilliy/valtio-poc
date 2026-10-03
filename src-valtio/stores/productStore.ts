import { proxy } from "valtio";
import { broadcastFieldIds, syncedFieldIds } from "@shared/dealFields.ts";
import {
  type ProductFieldId,
  asyncOptionFields,
  existsForParam,
  fieldExists,
} from "@shared/fields.ts";
import { deleteValueByPath, getValueByPath, setValueByPath } from "@shared/lib/path.ts";
import { reconcileOption } from "@shared/options/optionsSource.ts";
import {
  type AnyProductStore,
  type ProductData,
  type ProductType,
  type ProductUi,
  definitionOf,
} from "@shared/products/productRegistry.ts";
import type { DealStore } from "./dealStore.ts";
import { optionsStore } from "./optionsStore.ts";
import { subscribeDealKey, subscribePath } from "./subscribe.ts";
import { watchFieldValidation } from "./validation.ts";

/**
 * Product factory: turns a product's declaration (`@shared/products`) into a
 * live valtio product. Nothing here is specific to a product type — the
 * declaration supplies the names, paths, schemas, rules and derived fields.
 *
 * Every sync is a `subscribeKey` on the nested proxy that owns the field
 * (one cheap compare per write, unlike `valtio-reactive` effects, which
 * re-check on every deal change). Sync notification keeps everything
 * consistent within the keystroke.
 *
 * `productPath`: the product's path from the deal (validation keys).
 * `initialData`: a plain deep copy, to clone. `dispose` drops every
 * subscription, so a removed product is never written to again.
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
  const { data } = productStore;

  const path = (fieldId: ProductFieldId) => definition.fieldPaths[fieldId];
  const read = (fieldId: ProductFieldId) => getValueByPath(data, path(fieldId));
  // a field the product doesn't have (e.g. a fixing source without Cash) isn't written
  const write = (fieldId: ProductFieldId, value: unknown) => {
    if (fieldExists(fieldId, read)) setValueByPath(data, path(fieldId), value);
  };

  const subscriptions: Array<() => void> = [];
  const track = (unsubscribe: () => void) => subscriptions.push(unsubscribe);

  // Synced (two-way): the deal's value and this product's copy. Valtio
  // ignores same-value writes, so the echo back stops after one hop.
  for (const fieldId of syncedFieldIds) {
    track(subscribeDealKey($dealStore, fieldId, (value) => write(fieldId, value)));
    track(subscribePath(data, path(fieldId), (value) => Object.assign($dealStore, { [fieldId]: value })));
  }

  // Broadcasts (one-way): set and reset on the deal in one tick.
  for (const fieldId of broadcastFieldIds) {
    track(
      subscribeDealKey($dealStore, fieldId, (broadcast) => {
        if (broadcast !== undefined) write(fieldId, broadcast);
      }),
    );
  }

  // Derived: recomputed whenever a field it depends on changes.
  for (const [fieldId, derived] of Object.entries(definition.derived ?? {})) {
    const recompute = () => write(fieldId as ProductFieldId, derived.compute(data));
    derived.dependsOn.forEach((dependency) =>
      track(subscribePath(data, path(dependency), recompute)),
    );
  }

  // Async options: load for the current value of the field they depend on,
  // reload when it changes; keep the field's value if it's still an option,
  // else take the first. A response for a value the product left is ignored.
  // For a value the field doesn't exist for, it is removed (not just emptied)
  // and nothing loads.
  let disposed = false;
  for (const { fieldId, options } of asyncOptionFields) {
    const reload = async (param: string) => {
      if (!existsForParam(options, param)) {
        deleteValueByPath(data, path(fieldId));
        return;
      }
      const loaded = await optionsStore.actions.load(options.source, param);
      if (!loaded || disposed || read(options.dependsOn) !== param) return;
      write(fieldId, reconcileOption(read(fieldId), loaded));
    };
    void reload(String(read(options.dependsOn)));
    track(subscribePath(data, path(options.dependsOn), (param) => void reload(String(param))));
  }
  track(() => (disposed = true));

  // Validation: every field, against its schema and its rules.
  for (const fieldId of Object.keys(definition.schemas) as ProductFieldId[]) {
    track(watchFieldValidation($dealStore, definition, data, productPath, fieldId));
  }

  return {
    productStore,
    dispose: () => subscriptions.forEach((unsubscribe) => unsubscribe()),
  };
};
