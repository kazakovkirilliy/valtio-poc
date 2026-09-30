import { memo, useRef } from "react";
import { useAtomValue } from "jotai/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { EditorRow, Workspace } from "../state/workspace.ts";
import { TextInput } from "./TextInput.tsx";

const RowView = memo(function RowView({ row, workspace, index }: { row: EditorRow; workspace: Workspace; index: number }) {
  return (
    <section className="editor-row" aria-label={`Row ${index + 1}`}>
      <span className="row-number">{index + 1}</span>
      <TextInput field={workspace.baseCode} label="Base code" />
      <TextInput field={workspace.quoteCode} label="Quote code" />
      <TextInput field={row.level} label="Level" />
      <button
        className="button quiet"
        aria-label={`Remove row ${index + 1}`}
        onClick={() => workspace.actions.removeRow(row)}
      >
        Remove
      </button>
    </section>
  );
});

export function RowList({ workspace }: { workspace: Workspace }) {
  const rows = useAtomValue(workspace.rows);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 114,
    getItemKey: (index) => rows[index].id,
    overscan: 5,
    initialRect: { width: 1_000, height: 500 },
  });
  return (
    <div ref={scrollRef} className="row-scroll" aria-label="Editable rows" tabIndex={0}>
      {rows.length ? (
        <div className="row-canvas" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => (
            <div
              key={item.key}
              className="virtual-row"
              style={{ height: item.size, transform: `translateY(${item.start}px)` }}
            >
              <RowView row={rows[item.index]} workspace={workspace} index={item.index} />
            </div>
          ))}
        </div>
      ) : <p className="empty-state">No rows. Add a row to start editing.</p>}
    </div>
  );
}
