import { isSyncedField, syncedFieldIds } from "@shared/dealFields.ts";
import { type ProductFieldId, asyncOptionFields, fields } from "@shared/fields.ts";
import {
  type CellRef,
  DEAL_COLUMN_ID,
  type GridColumn,
  type GridSource,
  SETTINGS_COLUMN_ID,
  createCellNotifier,
  dealCell,
  productCell,
  settingCell,
  settingCells,
} from "@shared/grid/gridSource.ts";
import { isDealSetting } from "@shared/dealSettings.ts";
import { definitionOf, productTypeOf } from "@shared/products/productRegistry.ts";
import type { DealStore } from "./dealStore.ts";
import { type GroupsState, productsOf } from "./groupStore.ts";
import { $optionsByKey } from "./optionsStore.ts";
import { type ProductState, readProductField } from "./productStore.ts";

const productsById = (groups: GroupsState) =>
  new Map(productsOf(groups).map((product) => [product.id, product]));

const productCells = (productId: string): CellRef[] =>
  fields.map(({ id }) => ({ columnId: productId, fieldId: id }));

/**
 * The deal grid over a nested effector deal: one `$groups` store holds the
 * groups, each with its products. State is immutable and a write copies only
 * the path to what changed, so comparing product identities finds the
 * products (and their issues) to repaint.
 *
 * Writes (a paste): one `writeCellsAction` event. Its reducer folds every
 * write into one new `$groups`, so validation, autocalc, option reloads and
 * the grid each see the paste once.
 */
export const createGridSource = (deal: DealStore): GridSource => {
  const getColumns = (): GridColumn[] => [
    { id: DEAL_COLUMN_ID, title: "Deal" },
    ...Object.values(deal.$groups.getState()).flatMap((group) =>
      Object.values(group.products).map((product) => ({
        id: product.id,
        title: product.ui.title,
        group: { id: group.id, title: group.ui.title },
      })),
    ),
  ];

  const getCell: GridSource["getCell"] = (columnId, fieldId) => {
    if (columnId === SETTINGS_COLUMN_ID) {
      return isDealSetting(fieldId) ? settingCell(fieldId, deal.$settings.getState()) : null;
    }
    if (isDealSetting(fieldId)) return null;
    const byKey = $optionsByKey.getState();
    if (columnId === DEAL_COLUMN_ID) {
      const synced = isSyncedField(fieldId) ? deal.$dealFields.getState()[fieldId] : undefined;
      return dealCell(fieldId, synced, byKey, deal.spotPriceStream);
    }
    const product = productsById(deal.$groups.getState()).get(columnId);
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

  // a group added or removed, or re-titled: the group objects themselves change
  const subscribeColumns: GridSource["subscribeColumns"] = (onChange) => {
    let groups = Object.values(deal.$groups.getState());
    return deal.$groups.updates.watch((next) => {
      const previous = groups;
      groups = Object.values(next);
      const sameGroups =
        previous.length === groups.length &&
        groups.every((group, i) => group.id === previous[i].id && group.ui === previous[i].ui);
      if (!sameGroups) onChange();
    });
  };

  return {
    getColumns,

    subscribeColumns,
    getCell,

    subscribeCells(onChange) {
      const { notify, stop: stopNotifier } = createCellNotifier({ getCell, getColumns, subscribeColumns }, onChange);
      let products: Map<string, ProductState> = productsById(deal.$groups.getState());
      let validation = deal.$validation.getState();
      const asyncCells = () =>
        getColumns().flatMap(({ id }) => asyncOptionFields.map(({ fieldId }) => ({ columnId: id, fieldId })));
      const stops = [
        stopNotifier,
        deal.$settings.updates.watch(() => notify(settingCells)),
        deal.$groups.updates.watch((groups) => {
          const next = productsById(groups);
          const changed = [...next].filter(([id, product]) => products.get(id) !== product).map(([id]) => id);
          products = next;
          notify(changed.flatMap(productCells));
        }),
        deal.$validation.updates.watch((next) => {
          const changed = Object.keys(next).filter((id) => validation[id] !== next[id]);
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

    // settings are their own event; every field write is one batch
    write(writes) {
      for (const { fieldId, value } of writes) {
        if (isDealSetting(fieldId)) deal.actions.setSettingAction({ id: fieldId, value });
      }
      const fieldWrites = writes.filter(({ fieldId }) => !isDealSetting(fieldId));
      if (fieldWrites.length) deal.actions.writeCellsAction(fieldWrites);
    },
    cloneGroup: (groupId) => deal.actions.cloneGroupAction(groupId),
    removeGroup: (groupId) => deal.actions.removeGroupAction(groupId),
    spotPriceStream: deal.spotPriceStream,
  };
};
