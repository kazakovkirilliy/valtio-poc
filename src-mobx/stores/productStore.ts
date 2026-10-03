import { observable } from "mobx";
import { type SyncedFieldId, isSyncedField } from "@shared/dealFields.ts";
import {
  type AsyncFieldOptions,
  type ProductFieldId,
  asyncOptionFields,
  existsForParam,
  fieldExists,
  fieldsAbsentFor,
} from "@shared/fields.ts";
import {
  deleteValueByPath,
  getValueByPath,
  resolveParent,
  setValueByPath,
} from "@shared/lib/path.ts";
import { uuid } from "@shared/lib/uuid.ts";
import { reconcileOption } from "@shared/options/optionsSource.ts";
import {
  type GenericProductDefinition,
  type ProductData,
  type ProductType,
  type ProductUi,
  definitionOf,
  isReadOnly,
} from "@shared/products/productRegistry.ts";
import { fieldIssues } from "@shared/validation.ts";
import { type FieldModel, createFieldModel } from "./fieldModel.ts";
import { optionsStore } from "./optionsStore.ts";

/** The deal, as a product sees it: starting values and the two-way sync. */
export type ProductOwner = {
  readonly notionalCcy: string;
  readonly premiumCcy: string;
  setSynced(id: SyncedFieldId, value: string): void;
};

/** A live product: its declared state, plus what the UI and the deal use. */
export type Product = {
  readonly id: string;
  ui: ProductUi;
  data: ProductData;
  /** One model per field, for the inputs. */
  readonly fields: Record<ProductFieldId, FieldModel>;
  readonly hasValidationErrors: boolean;
  setField(id: ProductFieldId, value: unknown): void;
};

/**
 * Derived fields become getters, which `observable` turns into computeds:
 * always in step, nothing to subscribe to or dispose. (`toJS` leaves
 * computeds out, so a clone's plain data gets its getters back here.)
 */
const withDerivedFields = (
  definition: GenericProductDefinition,
  data: ProductData,
  product: () => Product,
) => {
  for (const [fieldId, derived] of Object.entries(definition.derived ?? {})) {
    const { parent, key } = resolveParent(data, definition.fieldPaths[fieldId as ProductFieldId]);
    Object.defineProperty(parent, key, {
      get: () => derived.compute(product().data),
      enumerable: true,
      configurable: true,
    });
  }
  return data;
};

/**
 * Product factory: turns a product's declaration (`@shared/products`) into a
 * live MobX product. Nothing here is specific to a product type.
 * `sourceData`: plain data to copy (a clone); otherwise the deal's defaults.
 */
export const createProduct = (
  productType: ProductType,
  owner: ProductOwner,
  ui: ProductUi,
  sourceData?: ProductData,
): Product => {
  const definition = definitionOf(productType);
  const path = (fieldId: ProductFieldId) => definition.fieldPaths[fieldId];
  const read = (fieldId: ProductFieldId) => getValueByPath(product.data, path(fieldId));

  // Async options: load for the current value of the field they depend on,
  // reload whenever `setField` changes it; keep the field's value if it is
  // still an option, else take the first. A response for a value the
  // product has since left is ignored; a field the product doesn't have
  // loads nothing.
  const reload = async (fieldId: ProductFieldId, options: AsyncFieldOptions) => {
    const param = String(read(options.dependsOn));
    if (!existsForParam(options, param)) return;
    const loaded = await optionsStore.load(options.source, param);
    if (!loaded || read(options.dependsOn) !== param) return;
    product.setField(fieldId, reconcileOption(read(fieldId), loaded));
  };

  const fields = Object.fromEntries(
    (Object.keys(definition.fieldPaths) as ProductFieldId[]).map((fieldId) => [
      fieldId,
      createFieldModel({
        read: () => read(fieldId),
        issues: () => fieldIssues(definition, fieldId, product.data),
        readOnly: isReadOnly(definition, fieldId),
        // synced fields go through the deal, which writes every product
        commit: (value) =>
          isSyncedField(fieldId)
            ? owner.setSynced(fieldId, String(value))
            : product.setField(fieldId, value),
      }),
    ]),
  ) as Record<ProductFieldId, FieldModel>;

  const product: Product = observable<Product>(
    {
      id: uuid(),
      ui,
      data: withDerivedFields(definition, sourceData ?? definition.createData(owner), () => product),
      fields,
      get hasValidationErrors() {
        return Object.values(fields).some((field) => field.issues.length > 0);
      },
      setField(fieldId, value) {
        if (isReadOnly(definition, fieldId)) return; // derived: computed, never written
        if (!fieldExists(fieldId, read)) return; // e.g. a fixing source without Cash
        setValueByPath(product.data, path(fieldId), value);
        // fields that stop existing are removed, not just emptied
        fieldsAbsentFor(fieldId, value).forEach((absentId) =>
          deleteValueByPath(product.data, path(absentId)),
        );
        asyncOptionFields
          .filter(({ options }) => options.dependsOn === fieldId)
          .forEach(({ fieldId: dependent, options }) => void reload(dependent, options));
      },
    },
    { id: false, fields: false },
    { autoBind: true },
  );

  asyncOptionFields.forEach(({ fieldId, options }) => void reload(fieldId, options));
  return product;
};
