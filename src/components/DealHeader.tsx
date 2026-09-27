import { useDealStoreSnapshot } from "../contexts/DealStoreProvider.tsx";
import { useSnapshot } from "valtio/react";
import { multiTabStore } from "../stores/multiTabStore.ts";
import { memo } from "react";

export const DealHeader = memo(() => {
  const snap = useDealStoreSnapshot();
  const multiTabStoreSnap = useSnapshot(multiTabStore);

  return (
    <div className="deal__header">
      <button
        className="button"
        onClick={() => {
          snap.actions.addNewProduct();
        }}
      >
        Add New Product
      </button>

      <button
        className="button"
        onClick={() => {
          multiTabStoreSnap.actions.toggleSpotPriceStreamEnabled();
        }}
      >
        Toggle Spot Price Stream (
        {multiTabStoreSnap.devtools.isSpotPriceStreamEnabled
          ? "Enabled"
          : "Disabled"}
        )
      </button>
    </div>
  );
});

DealHeader.displayName = "DealHeader";
