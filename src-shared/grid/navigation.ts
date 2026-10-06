import { type FieldId, fields, navigationOrder } from "../fields.ts";

const rowOf = Object.fromEntries(fields.map(({ id }, row) => [id, row])) as Record<FieldId, number>;

/** A field column's rows in keyboard order: by priority (`navigationOrder`), not display. */
export const fieldRowsInOrder: readonly number[] = navigationOrder.map((id) => rowOf[id]);

/**
 * The next cell in keyboard order (Tab, Enter after an edit): through a
 * column's rows in its own order (`rowsOf`), then on to the next column's
 * first. Only cells `canStop` accepts are visited; `null` past the last cell
 * (or before the first, going back).
 */
export const nextInOrder = (
  row: number,
  cell: number,
  step: 1 | -1,
  cells: { first: number; count: number },
  rowsOf: (cell: number) => readonly number[],
  canStop: (row: number, cell: number) => boolean,
): { row: number; cell: number } | null => {
  let column = cell;
  let rows = rowsOf(column);
  let position = rows.indexOf(row);
  for (;;) {
    position += step;
    while (position < 0 || position >= rows.length) {
      column += step;
      if (column < cells.first || column >= cells.count) return null;
      rows = rowsOf(column);
      position = step > 0 ? 0 : rows.length - 1;
    }
    if (canStop(rows[position], column)) return { row: rows[position], cell: column };
  }
};
