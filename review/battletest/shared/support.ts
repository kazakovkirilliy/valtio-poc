import { it } from "vitest";
import { DEAL_SETTINGS_FIRST_ROW, dealSettings } from "@shared/dealSettings.ts";
import { fields } from "@shared/fields.ts";
import { cellText } from "@shared/grid/cellValues.ts";
import { parseTsv, toTsv } from "@shared/grid/clipboard.ts";
import { type CellRef, DEAL_COLUMN_ID, type GridSource, SETTINGS_COLUMN_ID } from "@shared/grid/gridSource.ts";
import { type CellRange, pasteWrites } from "@shared/grid/paste.ts";
import type { PathDeal } from "@shared/pathDeal.ts";
import { productPath } from "@shared/paths.ts";
import { definitionOfData } from "@shared/products/productWrites.ts";

/**
 * `bug(...)` is `it.fails`: the test states the spec'd behaviour, so it PASSES
 * while the bug reproduces. `SHOW_BUGS=1 npx vitest run tests/battletest/shared`
 * turns them into plain tests, to see each actual failure.
 */
export const bug = process.env.SHOW_BUGS ? it : it.fails;

/** A product's data path, by its position in the deal (across groups). */
export const productAt = (deal: PathDeal, i: number) => {
  const all = deal.getGroups().flatMap((group) => group.productIds.map((productId) => ({ groupId: group.id, productId })));
  const { groupId, productId } = all[i];
  const data = deal.getProduct(productId)!.data;
  return {
    groupId,
    productId,
    path: (dataPath: string) => productPath(groupId, productId, dataPath),
    fieldPath: (fieldId: string) =>
      productPath(groupId, productId, (definitionOfData(data).fieldPaths as Record<string, string>)[fieldId]),
  };
};

// --- the grid's layout and clipboard, as `dealGrid.ts` builds them (its helpers are private, so mirrored here)

type LayoutColumn = { labels: true } | { id: string };

const layoutOf = (grid: GridSource): LayoutColumn[] => {
  const columns = grid.getColumns();
  return [
    { labels: true },
    { id: SETTINGS_COLUMN_ID },
    ...columns.filter((column) => column.id === DEAL_COLUMN_ID),
    { labels: true },
    ...columns.filter((column) => column.id !== DEAL_COLUMN_ID),
  ];
};

const refAt = (layout: LayoutColumn[], row: number, cell: number): CellRef | null => {
  const column = layout[cell];
  if (!column || "labels" in column) return null;
  const key = column.id === SETTINGS_COLUMN_ID ? dealSettings[row - DEAL_SETTINGS_FIRST_ROW]?.id : fields[row].id;
  return key ? { columnId: column.id, fieldId: key } : null;
};

/** The grid cell index of a column: settings 1, deal 2, products from 4. */
export const gridCellOf = (grid: GridSource, columnId: string) =>
  layoutOf(grid).findIndex((column) => !("labels" in column) && column.id === columnId);

/** The grid row of a field. */
export const gridRowOf = (fieldId: string) => fields.findIndex((field) => field.id === fieldId);

/** What Ctrl+C puts on the clipboard for a range (`onCopy` in dealGrid.ts). */
export const gridCopy = (grid: GridSource, range: CellRange) => {
  const layout = layoutOf(grid);
  const cells = layout.flatMap((column, cell) => ("labels" in column ? [] : [cell])).filter(
    (cell) => cell >= range.fromCell && cell <= range.toCell,
  );
  const rows: string[][] = [];
  for (let row = range.fromRow; row <= range.toRow; row++) {
    rows.push(
      cells.map((cell) => {
        const ref = refAt(layout, row, cell);
        return cellText(ref ? grid.getCell(ref.columnId, ref.fieldId) : null);
      }),
    );
  }
  return toTsv(rows);
};

/** What Ctrl+V does with clipboard text (`onPaste` in dealGrid.ts). */
export const gridPaste = (grid: GridSource, text: string, range: CellRange) => {
  const layout = layoutOf(grid);
  const result = pasteWrites({
    data: parseTsv(text),
    range,
    rowCount: fields.length,
    dataCells: layout.flatMap((column, cell) => ("labels" in column ? [] : [cell])),
    cellAt: (row, cell) => {
      const ref = refAt(layout, row, cell);
      return ref && { ref, view: grid.getCell(ref.columnId, ref.fieldId) };
    },
  });
  grid.write(result.writes);
  return result;
};
