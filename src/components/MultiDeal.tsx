import { Deal } from "./Deal.tsx";
import { useSnapshot } from "valtio/react";
import { multiTabStore } from "../stores/multiTabStore.ts";
import { DealStoreProvider } from "../contexts/DealStoreProvider.tsx";
import clsx from "clsx";
import { useEffect, memo } from "react";

export const MultiDeal = memo(() => {
  const snap = useSnapshot(multiTabStore);

  useEffect(() => {
    snap.actions.addNewDeal();
  }, [snap.actions]);

  return (
    <section>
      <div className="multiDeal-header">
        {Object.keys(snap.deals).map((key, index) => {
          const isActive = key === snap.activeDealId;
          return (
            <button
              key={key}
              className={clsx("button", {
                "button-active": isActive,
              })}
              onClick={() => {
                snap.actions.setActiveDeal(key);
              }}
            >
              Tab {index + 1}
            </button>
          );
        })}

        <button
          className="button"
          onClick={() => {
            snap.actions.addNewDeal();
          }}
        >
          Add New Deal
        </button>
      </div>
      <div>
        {Object.keys(snap.deals).map((key: string) => {
          if (key == snap.activeDealId) {
            return (
              <DealStoreProvider
                key={key}
                currentDeal={multiTabStore.deals[key]}
              >
                <Deal />
              </DealStoreProvider>
            );
          }
        })}
      </div>
    </section>
  );
});

MultiDeal.displayName = "MultiDeal";
