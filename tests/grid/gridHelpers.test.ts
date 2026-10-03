import { describe, expect, it } from "vitest";
import { fields, navigationOrder } from "@shared/fields.ts";
import { cellText, parseCellText } from "@shared/grid/cellValues.ts";
import { parseTsv, toTsv } from "@shared/grid/clipboard.ts";
import type { CellView } from "@shared/grid/gridSource.ts";
import { nextInOrder } from "@shared/grid/navigation.ts";
import { pasteWrites } from "@shared/grid/paste.ts";

const row = (id: string) => fields.findIndex((field) => field.id === id);
const cash: CellView = {
  value: "4",
  hasError: false,
  readOnly: false,
  options: { status: "loaded", options: [{ value: "4", label: "Cash D" }, { value: "3", label: "Shared C" }] },
};

describe("tab-separated text", () => {
  it("round-trips cells holding tabs, newlines and quotes, as spreadsheets quote them", () => {
    const rows = [["a", "b\tc"], ['say "hi"', "two\nlines"]];
    expect(toTsv(rows)).toBe('a\t"b\tc"\n"say ""hi"""\t"two\nlines"');
    expect(parseTsv(toTsv(rows))).toEqual(rows);
  });

  it("drops the trailing newline spreadsheets add, and Windows line endings", () => {
    expect(parseTsv("1\t2\r\n3\t4\r\n")).toEqual([["1", "2"], ["3", "4"]]);
  });
});

describe("cell values", () => {
  it("shows a dropdown's label and an empty number as nothing", () => {
    expect(cellText(cash)).toBe("Cash D");
    expect(cellText({ value: NaN, hasError: false, readOnly: false })).toBe("");
  });

  it("parses pasted text by the field's input type", () => {
    expect(parseCellText("notionalAmount", "1,500", null)).toEqual({ value: 1500 });
    expect(parseCellText("notionalAmount", "", null)).toEqual({ value: NaN });
    expect(parseCellText("notionalAmount", "abc", null)).toBeNull();
    expect(parseCellText("expiryDate", "2999-01-01", null)).toEqual({ value: "2999-01-01" });
    expect(parseCellText("expiryDate", "01/01/2999", null)).toBeNull();
    // a dropdown takes a value or a label
    expect(parseCellText("settlementFixingSource", "Shared C", cash)).toEqual({ value: "3" });
    expect(parseCellText("settlementFixingSource", "4", cash)).toEqual({ value: "4" });
    expect(parseCellText("settlementFixingSource", "Nope", cash)).toBeNull();
  });
});

describe("paste", () => {
  // columns: 0 deal, 1 labels (no values), 2 and 3 products
  const dataCells = [0, 2, 3];
  const cellAt = (r: number, cell: number) => ({
    ref: { columnId: `c${cell}`, fieldId: fields[r].id },
    view: fields[r].id === "expiryDays"
      ? { value: NaN, hasError: false, readOnly: true }
      : { value: "", hasError: false, readOnly: false },
  });

  it("pastes a block from the corner, passing over the labels column", () => {
    const { writes, skipped } = pasteWrites({
      data: [["1", "2", "3"]],
      range: { fromRow: row("strike"), fromCell: 0, toRow: row("strike"), toCell: 0 },
      rowCount: fields.length,
      dataCells,
      cellAt,
    });
    expect(writes.map(({ columnId, value }) => [columnId, value])).toEqual([["c0", "1"], ["c2", "2"], ["c3", "3"]]);
    expect(skipped).toBe(0);
  });

  it("fills a selection with a single value and skips read-only cells", () => {
    const { writes, skipped } = pasteWrites({
      data: [["2999-01-01"]],
      range: { fromRow: row("expiryDate"), fromCell: 2, toRow: row("expiryDays"), toCell: 3 },
      rowCount: fields.length,
      dataCells,
      cellAt,
    });
    expect(writes.map(({ columnId, fieldId }) => `${columnId}:${fieldId}`)).toEqual(["c2:expiryDate", "c3:expiryDate"]);
    expect(skipped).toBe(2); // expiry days, twice
  });
});

describe("keyboard order", () => {
  it("starts with Notional Amount, Expiry Date, Strike, then display order", () => {
    expect(navigationOrder.slice(0, 4)).toEqual(["notionalAmount", "expiryDate", "strike", "notionalCcy"]);
    expect([...navigationOrder].sort()).toEqual(fields.map(({ id }) => id).sort());
  });

  it("goes through a column by priority, skipping cells it can't stop at, then on to the next column", () => {
    const canStop = (_row: number, cell: number) => cell !== 1; // column 1: the labels
    const next = (r: number, cell: number, step: 1 | -1 = 1) =>
      nextInOrder(r, cell, step, { first: 0, count: 3 }, canStop);
    expect(next(row("notionalAmount"), 0)).toEqual({ row: row("expiryDate"), cell: 0 });
    expect(next(row("strike"), 0)).toEqual({ row: row("notionalCcy"), cell: 0 });
    const last = row(navigationOrder[navigationOrder.length - 1]);
    expect(next(last, 0)).toEqual({ row: row("notionalAmount"), cell: 2 }); // labels passed over
    expect(next(last, 2)).toBeNull(); // past the last cell
    expect(next(row("notionalAmount"), 2, -1)).toEqual({ row: last, cell: 0 });
  });
});
