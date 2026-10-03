import { isSyncedField, syncedFieldIds } from "@shared/dealFields.ts";
import { type ProductFieldId, asyncOptionFields, fields } from "@shared/fields.ts";
import {
  type CellRef,
  DEAL_COLUMN_ID,
  type GridColumn,
  type GridSource,
  createCellNotifier,
  dealCell,
  productCell,
} from "@shared/grid/gridSource.ts";
import { definitionOf, productTypeOf } from "@shared/products/productRegistry.ts";
import type { DealStore } from "./dealStore.ts";
import { $optionsByKey } from "./optionsStore.ts";
import { readProductField } from "./productStore.ts";

/** The ids whose value is a different object than before: immutable data changed there. */
const changedIds = (previous: Record<string, unknown>, next: Record<string, unknown>) =>
  Object.keys(next).filter((id) => previous[id] !== next[id]);

const productCells = (productId: string): CellRef[] =>
  fields.map(({ id }) => ({ columnId: productId, fieldId: id }));

/**
 * The deal grid over an effector deal. Reads are the stores' current state.
 * State is immutable, so a product that changed is a new object: comparing
 * identities finds the products (and their issues) to repaint.
 *
 * Writes (a paste): one `writeCellsAction` event. Its reducers fold every
 * write into one new state per store, so validation, autocalc, option
 * reloads and the grid each see the paste once.
 */
export const createGridSource = (deal: DealStore): GridSource => {
  const getColumns = (): GridColumn[] => {
    const { byId, order } = deal.$groups.getState();
    const products = deal.$products.getState();
    return [
      { id: DEAL_COLUMN_ID, title: "Deal" },
      ...order.flatMap((groupId) =>
        byId[groupId].productIds.map((productId) => ({
          id: productId,
          title: products[productId].ui.title,
          group: { id: groupId, title: byId[groupId].ui.title },
        })),
      ),
    ];
  };

  const getCell: GridSource["getCell"] = (columnId, fieldId) => {
    const byKey = $optionsByKey.getState();
    if (columnId === DEAL_COLUMN_ID) {
      const synced = isSyncedField(fieldId) ? deal.$dealFields.getState()[fieldId] : undefined;
      return dealCell(fieldId, synced, byKey, deal.spotPriceStream);
    }
    const product = deal.$products.getState()[columnId];
    if (!product) return null;
    const issues = deal.$validation.getState()[columnId]?.[fieldId as ProductFieldId];
    return productCell(
      definitionOf(productTypeOf(product.data)),
      (id) => readProductField(product, id),
      fieldId,
      Boolean(issues?.length),
      byKey,
    );
  };

  // groups added, removed or re-titled (a group's products are fixed)
  const subscribeColumns: GridSource["subscribeColumns"] = (onChange) =>
    deal.$groups.updates.watch(() => onChange());

  return {
    getColumns,
    subscribeColumns,
    getCell,

    subscribeCells(onChange) {
      const { notify, stop: stopNotifier } = createCellNotifier({ getCell, getColumns, subscribeColumns }, onChange);
      let products = deal.$products.getState();
      let validation = deal.$validation.getState();
      const asyncCells = () =>
        getColumns().flatMap(({ id }) => asyncOptionFields.map(({ fieldId }) => ({ columnId: id, fieldId })));
      const stops = [
        stopNotifier,
        deal.$products.updates.watch((next) => {
          const changed = changedIds(products, next);
          products = next;
          notify(changed.flatMap(productCells));
        }),
        deal.$validation.updates.watch((next) => {
          const changed = changedIds(validation, next);
          validation = next;
          notify(changed.flatMap(productCells));
        }),
        deal.$dealFields.updates.watch(() =>
          notify(syncedFieldIds.map((fieldId) => ({ columnId: DEAL_COLUMN_ID, fieldId }))),
        ),
        $optionsByKey.updates.watch(() => notify(asyncCells())),
      ];
      return () => stops.forEach((stop) => stop());
    },

    write: (writes) => deal.actions.writeCellsAction(writes),
    cloneGroup: (groupId) => deal.actions.cloneGroupAction(groupId),
    removeGroup: (groupId) => deal.actions.removeGroupAction(groupId),
    spotPriceStream: deal.spotPriceStream,
  };
};
