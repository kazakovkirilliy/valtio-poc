import { compareStructural, reaction, runInAction } from "mobx";
import { isBroadcastField, isSyncedField } from "@shared/dealFields.ts";
import { type FieldId, type ProductFieldId, fields } from "@shared/fields.ts";
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
import { optionsStore } from "./optionsStore.ts";
import type { Product } from "./productStore.ts";

/**
 * The deal grid over a MobX deal. Reads go through the product's field
 * models (`value`, `issues`), and every cell is watched by its own
 * reaction, which MobX re-runs only when something that cell read changes.
 *
 * Writes (a paste): one `runInAction`. Every write lands at once and the
 * reactions (the grid's cells, the deal's autocalc and inputs-changed) run a
 * single time, after the last one.
 */
export const createGridSource = (deal: DealStore): GridSource => {
  const findProduct = (productId: string): Product | undefined =>
    deal.products.find((product) => product.id === productId);

  const getColumns = (): GridColumn[] => [
    { id: DEAL_COLUMN_ID, title: "Deal" },
    ...deal.groupIds.flatMap((groupId) => {
      const group = deal.groups[groupId];
      return group.productList.map((product) => ({
        id: product.id,
        title: product.ui.title,
        group: { id: groupId, title: group.ui.title },
      }));
    }),
  ];

  const getCell: GridSource["getCell"] = (columnId, fieldId) => {
    if (columnId === DEAL_COLUMN_ID) {
      const synced = isSyncedField(fieldId) ? deal[fieldId] : undefined;
      return dealCell(fieldId, synced, optionsStore.byKey, deal.spotPriceStream);
    }
    const product = findProduct(columnId);
    if (!product) return null;
    const field = product.fields[fieldId as ProductFieldId];
    return productCell(
      definitionOf(productTypeOf(product.data)),
      (id) => product.fields[id].value,
      fieldId,
      Boolean(field?.issues.length),
      optionsStore.byKey,
    );
  };

  /** A product field: through its model, so synced fields go through the deal. */
  const writeProduct = (productId: string, fieldId: FieldId, value: unknown) => {
    const field = findProduct(productId)?.fields[fieldId as ProductFieldId];
    field?.commit(value);
  };

  const subscribeColumns: GridSource["subscribeColumns"] = (onChange) =>
    reaction(
      () => getColumns().map(({ id, title, group }) => `${id}:${title}:${group?.title}`),
      onChange,
      { equals: compareStructural },
    );

  return {
    getColumns,
    subscribeColumns,
    getCell,

    subscribeCells(onChange) {
      const { notify, stop: stopNotifier } = createCellNotifier({ getCell, getColumns, subscribeColumns }, onChange);
      // one reaction per cell: it re-runs only when what this cell shows changes
      const watchCell = (cell: CellRef) =>
        reaction(
          () => {
            const view = getCell(cell.columnId, cell.fieldId);
            return view && [view.value, view.hasError, view.readOnly, view.options];
          },
          () => notify([cell]),
          { equals: compareStructural },
        );
      const columnStops = new Map<string, () => void>();
      const watchColumns = () => {
        const current = new Set(getColumns().map(({ id }) => id));
        for (const columnId of current) {
          if (columnStops.has(columnId)) continue;
          const stops = fields.map(({ id }) => watchCell({ columnId, fieldId: id }));
          columnStops.set(columnId, () => stops.forEach((stop) => stop()));
        }
        for (const [columnId, stop] of columnStops) {
          if (current.has(columnId)) continue;
          stop();
          columnStops.delete(columnId);
        }
      };
      watchColumns();
      const stopColumns = reaction(() => getColumns().map(({ id }) => id), watchColumns, {
        equals: compareStructural,
      });
      return () => {
        stopNotifier();
        stopColumns();
        columnStops.forEach((stop) => stop());
      };
    },

    write: (writes) =>
      runInAction(() => {
        for (const { columnId, fieldId, value } of writes) {
          if (columnId !== DEAL_COLUMN_ID) writeProduct(columnId, fieldId, value);
          else if (isSyncedField(fieldId)) deal.setSynced(fieldId, value);
          else if (isBroadcastField(fieldId)) deal.broadcast(fieldId, value);
        }
      }),

    cloneGroup: (groupId) => deal.cloneGroup(groupId),
    removeGroup: (groupId) => deal.removeGroup(groupId),
    spotPriceStream: deal.spotPriceStream,
  };
};
