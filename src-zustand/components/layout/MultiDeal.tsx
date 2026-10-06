import "@shared/styles/multiDeal.css";
import { Deal } from "./Deal.tsx";
import { useStore } from "zustand";
import { multiTabStore } from "../../stores/multiTabStore.ts";
import { DealStoreProvider } from "../providers/DealStoreProvider.tsx";
import clsx from "clsx";
import { memo } from "react";
import type { DealStore } from "../../stores/dealStore.ts";
import { useOnMount } from "@shared/hooks/useOnMount.ts";

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
  // each deal is its own store: keystrokes never notify the tab store, and
  // `deals` is a new object only when a deal is added
  const deals = useStore(multiTabStore, (state) => state.deals);
  const activeDealId = useStore(multiTabStore, (state) => state.activeDealId);
  const dealKeys = Object.keys(deals);

  useOnMount(() => {
    multiTabStore.getState().actions.addNewDeal();
  });

  if (dealKeys.length === 0) {
    return <div>Loading...</div>;
  }

  return (
    <section>
      <div className="multi-deal__tabs">
        {dealKeys.map((key, index) => {
          const isActive = key === activeDealId;
          return (
            <button
              key={key}
              className={clsx("button", {
                "button--active": isActive,
              })}
              onClick={() => {
                multiTabStore.getState().actions.setActiveDeal(key);
              }}
            >
              Tab {index + 1}
            </button>
          );
        })}

        <button
          className="button"
          onClick={() => {
            multiTabStore.getState().actions.addNewDeal();
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
              isActive={key == activeDealId}
              dealStore={deals[key]}
            />
          );
        })}
      </div>
    </section>
  );
});

MultiDeal.displayName = "MultiDeal";
