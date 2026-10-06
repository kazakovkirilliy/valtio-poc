import "@shared/styles/multiDeal.css";
import { memo } from "react";
import { useValue } from "@legendapp/state/react";
import clsx from "clsx";
import { Deal } from "./Deal.tsx";
import { DealStoreProvider } from "../providers/DealStoreProvider.tsx";
import type { DealStore } from "../../stores/dealStore.ts";
import { useOnMount } from "@shared/hooks/useOnMount.ts";
import {
  addNewDeal,
  dealStores,
  multiTab$,
  setActiveDeal,
} from "../../stores/multiTabStore.ts";

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
export const MultiDeal = memo(() => {
  const dealIds = useValue(multiTab$.dealIds);
  const activeDealId = useValue(multiTab$.activeDealId);

  useOnMount(() => {
    addNewDeal();
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
            onClick={() => setActiveDeal(dealId)}
          >
            Tab {index + 1}
          </button>
        ))}

        <button className="button" onClick={addNewDeal}>
          Add New Deal
        </button>
      </div>
      <div>
        {dealIds.map((dealId) => (
          <SingleDeal
            key={dealId}
            isActive={dealId === activeDealId}
            deal={dealStores.get(dealId)!}
          />
        ))}
      </div>
    </section>
  );
});

MultiDeal.displayName = "MultiDeal";
