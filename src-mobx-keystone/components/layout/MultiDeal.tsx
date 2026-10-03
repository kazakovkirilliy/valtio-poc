import "@shared/styles/multiDeal.css";
import { memo } from "react";
import { observer } from "mobx-react-lite";
import clsx from "clsx";
import { Deal } from "./Deal.tsx";
import { DealStoreProvider } from "../providers/DealStoreProvider.tsx";
import type { Deal as DealModel } from "../../stores/dealModel.ts";
import { useOnMount } from "@shared/hooks/useOnMount.ts";
import { multiTabStore } from "../../stores/multiTabStore.ts";

const SingleDeal = memo(
  ({ isActive, deal }: { isActive: boolean; deal: DealModel }) => {
    if (!isActive) return null;
    return (
      <DealStoreProvider currentDeal={deal}>
        <Deal />
      </DealStoreProvider>
    );
  },
);

SingleDeal.displayName = "SingleDeal";

/** Reads only the deals list and the active id: edits inside a deal never re-render it. */
export const MultiDeal = observer(() => {
  const { deals, activeDealId } = multiTabStore;

  useOnMount(() => {
    multiTabStore.addNewDeal();
  });

  if (deals.length === 0) {
    return <div>Loading...</div>;
  }

  return (
    <section>
      <div className="multi-deal__tabs">
        {deals.map((deal, index) => (
          <button
            key={deal.id}
            className={clsx("button", {
              "button--active": deal.id === activeDealId,
            })}
            onClick={() => multiTabStore.setActiveDeal(deal.id)}
          >
            Tab {index + 1}
          </button>
        ))}

        <button className="button" onClick={() => multiTabStore.addNewDeal()}>
          Add New Deal
        </button>
      </div>
      <div>
        {deals.map((deal) => (
          <SingleDeal
            key={deal.id}
            isActive={deal.id === activeDealId}
            deal={deal}
          />
        ))}
      </div>
    </section>
  );
});

MultiDeal.displayName = "MultiDeal";
