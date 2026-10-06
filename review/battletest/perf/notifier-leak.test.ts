// Isolates the grid-mode growth seen in every app: the shared createCellNotifier
// (src-shared/grid/gridSource.ts) records what the grid shows per (column, field) and never forgets a removed column.
import { describe, expect, it } from "vitest";
import { type CellRef, type CellView, type GridColumn, createCellNotifier } from "@shared/grid/gridSource.ts";
import { fields } from "@shared/fields.ts";
import { heapMB } from "./harness.ts";

const makeSource = () => {
  let columns: GridColumn[] = [{ id: "deal", title: "Deal" }];
  const listeners = new Set<() => void>();
  return {
    set(next: GridColumn[]) {
      columns = next;
      listeners.forEach((l) => l());
    },
    source: {
      getColumns: () => columns,
      subscribeColumns: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      getCell: (columnId: string, fieldId: string): CellView => ({ value: `${columnId}:${fieldId}`, hasError: false, readOnly: false }),
    },
  };
};

describe("notifier leak", () => {
  it("memory kept per column that was added and removed again", () => {
    const { source, set } = makeSource();
    const changed: CellRef[][] = [];
    createCellNotifier(source as never, (cells) => changed.push([...cells]));
    const cycle = (n: number) => {
      for (let i = 0; i < n; i++) {
        set([{ id: "deal", title: "Deal" }, { id: `p${i}-${Math.random()}`, title: "P", group: { id: "g", title: "G" } }]);
        set([{ id: "deal", title: "Deal" }]);
      }
    };
    cycle(500);
    const before = heapMB();
    cycle(5000);
    const after = heapMB();
    const perColumnBytes = ((after - before) * 1024 * 1024) / 5000;
    console.log(`NOTIFIER-LEAK +${(after - before).toFixed(2)} MB for 5000 columns added then removed = ${(perColumnBytes / 1024).toFixed(2)} KB per column (${fields.length} fields each)`);
    expect(true).toBe(true);
  });
});
