import { isDealSetting } from "../dealSettings.ts";
import { existenceDependencies } from "../fields.ts";
import { parseCellText } from "./cellValues.ts";
import type { CellRef, CellView, CellWrite } from "./gridSource.ts";

export type CellRange = { fromRow: number; fromCell: number; toRow: number; toCell: number };

type PasteInput = {
  /** Parsed clipboard rows. */
  data: readonly (readonly string[])[];
  /** The selection (or the active cell) the paste starts at. */
  range: CellRange;
  rowCount: number;
  /** The grid cells that hold values, in order; any other column (the labels) is passed over. */
  dataCells: readonly number[];
  /** The cell at a position; `null` where a column has no cell (the settings column's other rows). */
  cellAt: (row: number, cell: number) => { ref: CellRef; view: CellView | null } | null;
};

/**
 * The writes a paste makes, top-down (field display order, so e.g. a
 * settlement style lands before the fixing source it decides), and the
 * cells it had to skip. One value over a selection fills the selection,
 * like a spreadsheet; anything else is pasted from the selection's corner,
 * one clipboard column per value column.
 */
export const pasteWrites = ({ data, range, rowCount, dataCells, cellAt }: PasteInput) => {
  const fill = data.length === 1 && data[0].length === 1;
  const height = fill ? range.toRow - range.fromRow + 1 : data.length;
  const width = Math.max(...data.map((row) => row.length));
  const targets = fill
    ? dataCells.filter((cell) => cell >= range.fromCell && cell <= range.toCell)
    : dataCells.filter((cell) => cell >= range.fromCell).slice(0, width);
  const writes: CellWrite[] = [];
  let skipped = 0;

  for (let r = 0; r < height && range.fromRow + r < rowCount; r++) {
    targets.forEach((cell, c) => {
      const text = fill ? data[0][0] : data[r][c];
      const target = cellAt(range.fromRow + r, cell);
      if (text === undefined || !target) return;
      const { ref, view } = target;
      // a missing cell is only worth writing if an earlier write can create it
      const canExist = view !== null || (!isDealSetting(ref.fieldId) && existenceDependencies(ref.fieldId).length > 0);
      const parsed = canExist && !view?.readOnly ? parseCellText(ref.fieldId, text, view) : null;
      if (parsed) writes.push({ ...ref, value: parsed.value });
      else skipped++;
    });
  }
  return {
    writes,
    skipped,
    pasted: {
      fromRow: range.fromRow,
      fromCell: targets[0] ?? range.fromCell,
      toRow: Math.min(range.fromRow + height, rowCount) - 1,
      toCell: targets[targets.length - 1] ?? range.fromCell,
    },
  };
};
