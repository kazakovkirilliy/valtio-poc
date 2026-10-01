import "./MultiDeal.css";
import { Deal } from "../deal/Deal.tsx";
import { useProxyKeys, useProxyValue } from "../lib/useProxyValue.ts";
import { multiTabStore } from "./multiTabStore.ts";
import { DealStoreProvider } from "../deal/DealStoreProvider.tsx";
import clsx from "clsx";
import { memo } from "react";
import type { DealStore } from "../deal/dealStore.ts";
import { useOnMount } from "../lib/useOnMount.ts";

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
  // narrow subscriptions: a snapshot of multiTabStore was notified by every
  // keystroke in every deal
  const dealKeys = useProxyKeys(multiTabStore.deals);
  const activeDealId = useProxyValue(multiTabStore, "activeDealId");

  useOnMount(() => {
    multiTabStore.actions.addNewDeal();
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
              isActive={key == activeDealId}
              dealStore={multiTabStore.deals[key]}
            />
          );
        })}
      </div>
    </section>
  );
});

MultiDeal.displayName = "MultiDeal";
