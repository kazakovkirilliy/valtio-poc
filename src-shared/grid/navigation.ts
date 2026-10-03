import { type FieldId, fields, navigationOrder } from "../fields.ts";

const rowOf = Object.fromEntries(fields.map(({ id }, row) => [id, row])) as Record<FieldId, number>;

/**
 * The next cell in keyboard order (Tab, Enter after an edit): through a
 * column's fields by priority (`navigationOrder`), then on to the next
 * column's first. Only cells `canStop` accepts are visited; `null` past the
 * last cell (or before the first, going back).
 */
export const nextInOrder = (
  row: number,
  cell: number,
  step: 1 | -1,
  cells: { first: number; count: number },
  canStop: (row: number, cell: number) => boolean,
): { row: number; cell: number } | null => {
  let position = navigationOrder.indexOf(fields[row].id);
  let column = cell;
  for (;;) {
    position += step;
    if (position < 0 || position >= navigationOrder.length) {
      column += step;
      if (column < cells.first || column >= cells.count) return null;
      position = step > 0 ? 0 : navigationOrder.length - 1;
    }
    const target = rowOf[navigationOrder[position]];
    if (canStop(target, column)) return { row: target, cell: column };
  }
};
