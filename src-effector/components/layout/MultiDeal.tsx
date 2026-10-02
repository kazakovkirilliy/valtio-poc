import "./MultiDeal.css";
import { memo } from "react";
import clsx from "clsx";
import { useAction, useValue } from "../../hooks/units.ts";
import { useOnMount } from "../../hooks/useOnMount.ts";
import {
  $activeDealId,
  $dealIds,
  addNewDealAction,
  getDealStore,
  setActiveDealAction,
} from "../../stores/multiTabStore.ts";
import { Deal } from "./Deal.tsx";
import { DealStoreProvider } from "../providers/DealStoreProvider.tsx";

const SingleDeal = memo(
  ({ isActive, dealId }: { isActive: boolean; dealId: string }) => {
    if (!isActive) return null;
    return (
      <DealStoreProvider currentDeal={getDealStore(dealId)}>
        <Deal />
      </DealStoreProvider>
    );
  },
);

SingleDeal.displayName = "SingleDeal";

/** Reads only the deal ids and the active id: edits inside a deal never re-render it. */
export const MultiDeal = memo(() => {
  const dealIds = useValue($dealIds);
  const activeDealId = useValue($activeDealId);
  const onAddNewDeal = useAction(addNewDealAction);
  const onSetActiveDeal = useAction(setActiveDealAction);

  useOnMount(() => {
    onAddNewDeal();
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
            onClick={() => onSetActiveDeal(dealId)}
          >
            Tab {index + 1}
          </button>
        ))}

        <button className="button" onClick={() => onAddNewDeal()}>
          Add New Deal
        </button>
      </div>
      <div>
        {dealIds.map((dealId) => (
          <SingleDeal
            key={dealId}
            isActive={dealId === activeDealId}
            dealId={dealId}
          />
        ))}
      </div>
    </section>
  );
});

MultiDeal.displayName = "MultiDeal";
