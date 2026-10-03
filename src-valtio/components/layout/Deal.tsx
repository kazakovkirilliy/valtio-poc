import "@shared/styles/deal.css";
import { memo, useMemo } from "react";
import { DealGrid } from "@shared/grid/DealGrid.tsx";
import { useOnMount } from "@shared/hooks/useOnMount.ts";
import { createGridSource } from "../../stores/gridSource.ts";
import { DealHeader } from "./DealHeader.tsx";
import { useDealStore } from "../providers/DealStoreProvider.tsx";

export const Deal = memo(() => {
  const dealStore = useDealStore();
  const source = useMemo(() => createGridSource(dealStore), [dealStore]);

  useOnMount(() => {
    dealStore.actions.addNewGroup("VanillaGroup");
  });

  return (
    <section className="deal">
      <DealHeader />
      <DealGrid source={source} />
    </section>
  );
});

Deal.displayName = "Deal";
