import { syncedFieldIds } from "@shared/dealFields.ts";
import { isDealSetting } from "@shared/dealSettings.ts";
import { type ProductFieldId, asyncOptionFields, fields } from "@shared/fields.ts";
import {
  type CellKey,
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
import type { DealStore, GroupItem, ProductItem } from "./dealStore.ts";
import { $optionsByKey } from "./optionsStore.ts";
import { type PathWrite, productPath } from "./paths.ts";
import { definitionOfData } from "./productModel.ts";

const productCells = (productId: string): CellRef[] =>
  fields.map(({ id }) => ({ columnId: productId, fieldId: id }));

const productsById = (groups: readonly GroupItem[]) =>
  new Map(groups.flatMap((group) => group.products.map((product) => [product.id, product] as const)));

/**
 * The deal grid over an `@effector/model` deal, speaking only dot paths:
 * every cell is a path (`notionalCcy`, `hedgeType`,
 * `groups.<id>.products.<id>.data.optionsCommon.strike`), read with
 * `readPath` and written with `writePathsAction`, as the app being migrated
 * would. Each product is its own store, so a product that changed is a new
 * item object: comparing identities finds the products to repaint.
 *
 * Writes (a paste): one `writePathsAction` with every path, routed in one
 * event to the products it addresses.
 */
export const createGridSource = (deal: DealStore): GridSource => {
  const locate = (productId: string): { groupId: string; product: ProductItem } | null => {
    for (const group of deal.$groups.getState()) {
      const product = group.products.find((candidate) => candidate.id === productId);
      if (product) return { groupId: group.id, product };
    }
    return null;
  };

  /** The dot path a cell reads and writes; `null` for a cell that has none. */
  const pathOf = (columnId: string, key: CellKey): string | null => {
    if (columnId === SETTINGS_COLUMN_ID || columnId === DEAL_COLUMN_ID) return key;
    const found = locate(columnId);
    if (!found?.product.data || isDealSetting(key)) return null;
    const fieldPath = definitionOfData(found.product.data).fieldPaths[key as ProductFieldId];
    return fieldPath ? productPath(found.groupId, columnId, fieldPath) : null;
  };

  const getColumns = (): GridColumn[] => [
    { id: DEAL_COLUMN_ID, title: "Deal" },
    ...deal.$groups.getState().flatMap((group) =>
      group.products.map((product) => ({
        id: product.id,
        title: product.ui.title,
        group: { id: group.id, title: group.ui.title },
      })),
    ),
  ];

  const getCell: GridSource["getCell"] = (columnId, key) => {
    if (columnId === SETTINGS_COLUMN_ID) {
      return isDealSetting(key) ? settingCell(key, deal.$settings.getState()) : null;
    }
    if (isDealSetting(key)) return null;
    const byKey = $optionsByKey.getState();
    if (columnId === DEAL_COLUMN_ID) return dealCell(key, deal.readPath(key), byKey, deal.spotPriceStream);
    const found = locate(columnId);
    if (!found?.product.data) return null;
    const definition = definitionOfData(found.product.data);
    return productCell(
      definition,
      (id) => deal.readPath(productPath(found.groupId, columnId, definition.fieldPaths[id])),
      key,
      Boolean(found.product.issues[key as ProductFieldId]?.length),
      byKey,
    );
  };

  // a group added or removed, or re-titled: its item's `ui` (or the list) changes
  const subscribeColumns: GridSource["subscribeColumns"] = (onChange) => {
    let groups = deal.$groups.getState();
    return deal.$groups.updates.watch((next) => {
      const previous = groups;
      groups = next;
      const same =
        previous.length === next.length &&
        next.every((group, i) => group.id === previous[i].id && group.ui === previous[i].ui);
      if (!same) onChange();
    });
  };

  return {
    getColumns,
    subscribeColumns,
    getCell,

    subscribeCells(onChange) {
      const { notify, stop: stopNotifier } = createCellNotifier({ getCell, getColumns, subscribeColumns }, onChange);
      let products = productsById(deal.$groups.getState());
      const asyncCells = () =>
        getColumns().flatMap(({ id }) => asyncOptionFields.map(({ fieldId }) => ({ columnId: id, fieldId })));
      const stops = [
        stopNotifier,
        // a product item is a new object when its data or issues changed
        deal.$groups.updates.watch((groups) => {
          const next = productsById(groups);
          const changed = [...next].filter(([id, product]) => products.get(id) !== product).map(([id]) => id);
          products = next;
          notify(changed.flatMap(productCells));
        }),
        deal.$dealFields.updates.watch(() =>
          notify(syncedFieldIds.map((fieldId) => ({ columnId: DEAL_COLUMN_ID, fieldId }))),
        ),
        deal.$settings.updates.watch(() => notify(settingCells)),
        $optionsByKey.updates.watch(() => notify(asyncCells())),
      ];
      return () => stops.forEach((stop) => stop());
    },

    write(writes) {
      const pathWrites: PathWrite[] = writes.flatMap(({ columnId, fieldId, value }) => {
        const path = pathOf(columnId, fieldId);
        return path ? [{ path, value }] : [];
      });
      if (pathWrites.length) deal.actions.writePathsAction(pathWrites);
    },

    cloneGroup: (groupId) => deal.actions.cloneGroupAction(groupId),
    removeGroup: (groupId) => deal.actions.removeGroupAction(groupId),
    spotPriceStream: deal.spotPriceStream,
  };
};
