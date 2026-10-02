import { Deal } from "./Deal.tsx";
import { DealProvider, useStoreBindings } from "../contexts/StoreProvider.tsx";
import { memo } from "react";

export const MultiDeal = memo(() => {
  const bindings = useStoreBindings();
  const { dealIds, activeDealId, actions } = bindings.useWorkspace();
  return (
    <section aria-label="Deal workspace">
      <nav className="multiDeal-header" aria-label="Deals">
        {dealIds.map((id, index) => (
            <button key={id}
              className={`button ${id === activeDealId ? "button-active" : ""}`}
              aria-pressed={id === activeDealId} onClick={() => actions.setActiveDeal(id)}>
              Tab {index + 1}
            </button>
        ))}
        <button className="button" onClick={() => actions.addDeal()}>
          Add New Deal
        </button>
      </nav>
      <DealProvider key={activeDealId} dealId={activeDealId}>
        <Deal />
      </DealProvider>
    </section>
  );
});

MultiDeal.displayName = "MultiDeal";
