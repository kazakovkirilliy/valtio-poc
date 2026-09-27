import { Deal } from "./Deal.tsx";
import { useSnapshot } from "valtio/react";
import { multiTabStore } from "../stores/multiTabStore.ts";
import { DealStoreProvider } from "../contexts/DealStoreProvider.tsx";
import clsx from "clsx";
import { memo } from "react";
import type { DealStore } from "../stores/dealStore.ts";
import { useOnMount } from "../hooks/useOnMount.ts";

const SingleDeal = memo(
  ({ isActive, dealStore }: { isActive: boolean; dealStore: DealStore }) => {
    if (!isActive) return null;
    return (
      <DealStoreProvider currentDeal={dealStore}>
        <Deal />
      </DealStoreProvider>
    );
  },
);

export const MultiDeal = memo(() => {
  const snap = useSnapshot(multiTabStore);

  const dealKeys = Object.keys(snap.deals);

  useOnMount(() => {
    multiTabStore.actions.addNewDeal();
  });

  if (dealKeys.length === 0) {
    return <div>Loading...</div>;
  }

  return (
    <section>
      <div className="multiDeal-header">
        {dealKeys.map((key, index) => {
          const isActive = key === snap.activeDealId;
          return (
            <button
              key={key}
              className={clsx("button", {
                "button-active": isActive,
              })}
              onClick={() => {
                multiTabStore.actions.setActiveDeal(key);
              }}
            >
              Tab {index + 1}
            </button>
          );
        })}

        <button
          className="button"
          onClick={() => {
            multiTabStore.actions.addNewDeal();
          }}
        >
          Add New Deal
        </button>
      </div>
      <div>
        {dealKeys.map((key: string) => {
          return (
            <SingleDeal
              key={key}
              isActive={key == snap.activeDealId}
              dealStore={multiTabStore.deals[key]}
            />
          );
        })}
      </div>
    </section>
  );
});

MultiDeal.displayName = "MultiDeal";
