import "slickgrid/dist/styles/css/slick.grid.css";
import "slickgrid/dist/styles/css/slick-alpine-theme.css";
import "../styles/grid.css";
import { memo, useEffect, useRef } from "react";
import { mountDealGrid } from "./dealGrid.ts";
import type { GridSource } from "./gridSource.ts";

/**
 * The deal's grid. SlickGrid owns the DOM inside, painted from `source`, so
 * this component renders once per source: edits, pastes and option loads
 * repaint grid cells, never React.
 */
export const DealGrid = memo(({ source }: { source: GridSource }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => mountDealGrid(containerRef.current!, source), [source]);
  return <div className="deal-grid" ref={containerRef} />;
});

DealGrid.displayName = "DealGrid";
