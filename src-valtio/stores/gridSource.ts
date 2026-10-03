import { subscribe } from "valtio";
import { subscribeKey } from "valtio/utils";
import {
  isBroadcastField,
  isEmptyBroadcast,
  isSyncedField,
  syncedFieldIds,
} from "@shared/dealFields.ts";
import {
  type FieldId,
  type ProductFieldId,
  asyncOptionFields,
  fieldExists,
} from "@shared/fields.ts";
import {
  type CellRef,
  DEAL_COLUMN_ID,
  type GridColumn,
  type GridSource,
  SETTINGS_COLUMN_ID,
  createCellNotifier,
  dealCell,
  dependentFields,
  productCell,
  settingCell,
  settingCells,
} from "@shared/grid/gridSource.ts";
import { isDealSetting } from "@shared/dealSettings.ts";
import { getValueByPath, resolveParent, setValueByPath } from "@shared/lib/path.ts";
import {
  type ProductData,
  definitionOf,
  isReadOnly,
  productTypeOf,
} from "@shared/products/productRegistry.ts";
import type { DealStore } from "./dealStore.ts";
import { optionsStore } from "./optionsStore.ts";
import { toValidationKey } from "./validation.ts";

const definitionOfData = (data: ProductData) => definitionOf(productTypeOf(data));

/** A product's validation key for a field (see `validation.ts`). */
const validationKeyOf = (groupId: string, productId: string, path: string) =>
  toValidationKey(`groups.${groupId}.products.${productId}.data.${path}`);

/**
 * The deal grid over a valtio deal. Reads go straight to the proxies.
 * Changes are watched the valtio way, per key: each product field on the
 * nested proxy that owns it, so a write notifies only its own cell. They are
 * collected and handed to the grid once per tick.
 *
 * Writes (a paste): valtio has no transactions. Every write is a plain
 * proxy assignment, and the deal's sync subscriptions (synced ccys,
 * broadcasts, derived fields, validation) run as each one lands. Async
 * subscribers (this grid, autocalc) see the whole paste at once, a tick later.
 */
export const createGridSource = (dealStore: DealStore): GridSource => {
  const findProduct = (productId: string) => {
    for (const groupId of dealStore.groupIds) {
      const product = dealStore.groups[groupId]?.products[productId];
      if (product) return { groupId, data: product.data };
    }
    return null;
  };

  const getColumns = (): GridColumn[] => [
    { id: DEAL_COLUMN_ID, title: "Deal" },
    ...dealStore.groupIds.flatMap((groupId) => {
      const group = dealStore.groups[groupId];
      return group.productIds.map((productId) => ({
        id: productId,
        title: group.products[productId].ui.title,
        group: { id: groupId, title: group.ui.title },
      }));
    }),
  ];

  // groups are added and removed through the order, which re-titles them in the same tick
  const subscribeColumns = (onChange: () => void) => subscribe(dealStore.groupIds, onChange);

  const writeDeal = (fieldId: FieldId, value: unknown) => {
    if (isSyncedField(fieldId)) {
      Object.assign(dealStore, { [fieldId]: value });
    } else if (isBroadcastField(fieldId) && !isEmptyBroadcast(value)) {
      // written then reset: every product copies it (see productStore)
      dealStore[fieldId] = value;
      dealStore[fieldId] = undefined;
    }
  };

  const writeProduct = (productId: string, fieldId: FieldId, value: unknown) => {
    const data = findProduct(productId)?.data;
    if (!data) return;
    const definition = definitionOfData(data);
    if (!(fieldId in definition.fieldPaths)) return;
    const id = fieldId as ProductFieldId;
    const read = (field: ProductFieldId) => getValueByPath(data, definition.fieldPaths[field]);
    // derived fields, and fields this product doesn't have, are never written
    if (isReadOnly(definition, id) || !fieldExists(id, read)) return;
    setValueByPath(data, definition.fieldPaths[id], value);
  };

  const getCell: GridSource["getCell"] = (columnId, fieldId) => {
    if (columnId === SETTINGS_COLUMN_ID) return isDealSetting(fieldId) ? settingCell(fieldId, dealStore) : null;
    if (isDealSetting(fieldId)) return null;
    if (columnId === DEAL_COLUMN_ID) {
      const synced = isSyncedField(fieldId) ? dealStore[fieldId] : undefined;
      return dealCell(fieldId, synced, optionsStore.byKey, dealStore.spotPriceStream);
    }
    const found = findProduct(columnId);
    if (!found) return null;
    const definition = definitionOfData(found.data);
    const path = definition.fieldPaths[fieldId as ProductFieldId];
    const issues = path && dealStore.validationErrors[validationKeyOf(found.groupId, columnId, path)];
    return productCell(
      definition,
      (id) => getValueByPath(found.data, definition.fieldPaths[id]),
      fieldId,
      Boolean(issues?.length),
      optionsStore.byKey,
    );
  };

  return {
    getColumns,
    subscribeColumns,

    getCell,

    subscribeCells(onChange) {
      // collected per tick: a paste repaints each changed cell once
      const { notify, stop: stopNotifier } = createCellNotifier({ getCell, getColumns, subscribeColumns }, onChange);

      // each product field on its own key; validation keys, to compare on change
      const productStops = new Map<string, () => void>();
      const validationCells = new Map<string, readonly CellRef[]>();
      const watchProduct = (groupId: string, productId: string, data: ProductData) => {
        const stops = Object.entries(definitionOfData(data).fieldPaths).map(([field, path]) => {
          const fieldId = field as ProductFieldId;
          const cells = [fieldId, ...dependentFields(fieldId)].map((id) => ({ columnId: productId, fieldId: id }));
          validationCells.set(validationKeyOf(groupId, productId, path), cells);
          const { parent, key } = resolveParent(data, path);
          return parent ? subscribeKey(parent, key, () => notify(cells)) : () => {};
        });
        return () => stops.forEach((stop) => stop());
      };
      const watchProducts = () => {
        const current = new Set<string>();
        for (const groupId of dealStore.groupIds) {
          const group = dealStore.groups[groupId];
          for (const productId of group.productIds) {
            current.add(productId);
            if (!productStops.has(productId)) {
              productStops.set(productId, watchProduct(groupId, productId, group.products[productId].data));
            }
          }
        }
        for (const [productId, stop] of productStops) {
          if (current.has(productId)) continue;
          stop();
          productStops.delete(productId);
          for (const [key, [cell]] of validationCells) {
            if (cell.columnId === productId) validationCells.delete(key);
          }
        }
      };
      watchProducts();

      // one subscription for every product's issues: repaint the cells whose error state flipped
      const hadError = new Map<string, boolean>();
      const stopValidation = subscribe(dealStore.validationErrors, () => {
        const cells: CellRef[] = [];
        for (const [key, keyCells] of validationCells) {
          const hasError = Boolean(dealStore.validationErrors[key]?.length);
          if (hasError !== Boolean(hadError.get(key))) cells.push(...keyCells);
          hadError.set(key, hasError);
        }
        if (cells.length) notify(cells);
      });

      const asyncCells = () =>
        getColumns().flatMap(({ id }) => asyncOptionFields.map(({ fieldId }) => ({ columnId: id, fieldId })));
      const stops = [
        stopNotifier,
        subscribeKey(dealStore, "isInternal", () => notify(settingCells)),
        subscribeKey(dealStore, "hedgeType", () => notify(settingCells)),
        subscribeColumns(watchProducts),
        stopValidation,
        ...syncedFieldIds.map((fieldId) =>
          subscribeKey(dealStore, fieldId, () => notify([{ columnId: DEAL_COLUMN_ID, fieldId }])),
        ),
        subscribe(optionsStore.byKey, () => notify(asyncCells())),
      ];
      return () => {
        stops.forEach((stop) => stop());
        productStops.forEach((stop) => stop());
      };
    },

    write(writes) {
      for (const { columnId, fieldId, value } of writes) {
        if (isDealSetting(fieldId)) dealStore.actions.setSetting(fieldId, value);
        else if (columnId === DEAL_COLUMN_ID) writeDeal(fieldId, value);
        else writeProduct(columnId, fieldId, value);
      }
    },

    cloneGroup: (groupId) => dealStore.actions.cloneGroup(groupId),
    removeGroup: (groupId) => dealStore.actions.removeGroup(groupId),
    spotPriceStream: dealStore.spotPriceStream,
  };
};
