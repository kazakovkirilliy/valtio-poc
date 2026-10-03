import "@shared/styles/deal.css";
import { memo, useMemo } from "react";
import { DealGrid } from "@shared/grid/DealGrid.tsx";
import { useOnMount } from "@shared/hooks/useOnMount.ts";
import { useAction } from "../../hooks/units.ts";
import { createPathGridSource } from "@shared/grid/pathGridSource.ts";
import { createPathDeal } from "../../stores/pathDeal.ts";
import { DealHeader } from "./DealHeader.tsx";
import { useDealStore } from "../providers/DealStoreProvider.tsx";

export const Deal = memo(() => {
  const deal = useDealStore();
  const source = useMemo(() => createPathGridSource(createPathDeal(deal)), [deal]);
  const addGroup = useAction(deal.actions.addGroupAction);

  useOnMount(() => {
    addGroup("VanillaGroup");
  });

  return (
    <section className="deal">
      <DealHeader />
      <DealGrid source={source} />
    </section>
  );
});

Deal.displayName = "Deal";
