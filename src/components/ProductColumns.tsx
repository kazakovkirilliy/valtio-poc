import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useAtomValue } from "jotai/react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { Workspace } from "../state/workspace.ts";
import { ProductColumn } from "./ProductColumn.tsx";

const columnWidth = 268;
const rowHeight = 580;
const keepDealMounted: typeof defaultRangeExtractor = (range) => (
  [...new Set([0, ...defaultRangeExtractor(range)])]
);

/** Preserve wrapping columns while limiting mounted products to visible groups. */
export function ProductColumns({ workspace, dealColumn }: { workspace: Workspace; dealColumn: ReactNode }) {
  const products = useAtomValue(workspace.rows);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columnsPerRow, setColumnsPerRow] = useState(1);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setColumnsPerRow(Math.max(1, Math.floor(element.clientWidth / columnWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count: Math.ceil((products.length + 1) / columnsPerRow),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (index) => index === 0 ? "deal" : products[index * columnsPerRow - 1].id,
    rangeExtractor: keepDealMounted,
    overscan: 1,
    initialRect: { width: 1_000, height: 540 },
  });

  return (
    <div ref={scrollRef} className="columnsContainer" aria-label="Deal and product columns" tabIndex={0}>
      <div className="columns-canvas" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((group) => {
          const firstSlot = group.index * columnsPerRow;
          const slots = Math.min(columnsPerRow, products.length + 1 - firstSlot);
          return (
            <div
              key={group.key}
              className="column-group"
              style={{
                height: group.size,
                transform: `translateY(${group.start}px)`,
                gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, ${columnWidth}px))`,
              }}
            >
              {Array.from({ length: slots }, (_, offset) => {
                const slot = firstSlot + offset;
                if (slot === 0) return <div key="deal">{dealColumn}</div>;
                const product = products[slot - 1];
                return <ProductColumn key={product.id} product={product} workspace={workspace} index={slot - 1} />;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
