import "./MultiDeal.css";
import { memo } from "react";
import { observer } from "mobx-react-lite";
import clsx from "clsx";
import { Deal } from "./Deal.tsx";
import { DealStoreProvider } from "../providers/DealStoreProvider.tsx";
import type { DealStore } from "../../stores/dealStore.ts";
import { useOnMount } from "../../hooks/useOnMount.ts";
import { multiTabStore } from "../../stores/multiTabStore.ts";

const SingleDeal = memo(
  ({ isActive, deal }: { isActive: boolean; deal: DealStore }) => {
    if (!isActive) return null;
    return (
      <DealStoreProvider currentDeal={deal}>
        <Deal />
      </DealStoreProvider>
    );
  },
);

SingleDeal.displayName = "SingleDeal";

/** Reads only the deal ids and the active id: edits inside a deal never re-render it. */
export const MultiDeal = observer(() => {
  const { dealIds, activeDealId } = multiTabStore;

  useOnMount(() => {
    multiTabStore.addNewDeal();
  });

  if (dealIds.length === 0) {
    return <div>Loading...</div>;
  }

  return (
    <section>
      <div className="multi-deal__tabs">
        {dealIds.map((dealId, index) => (
          <button
            key={dealId}
            className={clsx("button", {
              "button--active": dealId === activeDealId,
            })}
            onClick={() => multiTabStore.setActiveDeal(dealId)}
          >
            Tab {index + 1}
          </button>
        ))}

        <button className="button" onClick={multiTabStore.addNewDeal}>
          Add New Deal
        </button>
      </div>
      <div>
        {dealIds.map((dealId) => (
          <SingleDeal
            key={dealId}
            isActive={dealId === activeDealId}
            deal={multiTabStore.deals[dealId]}
          />
        ))}
      </div>
    </section>
  );
});

MultiDeal.displayName = "MultiDeal";
