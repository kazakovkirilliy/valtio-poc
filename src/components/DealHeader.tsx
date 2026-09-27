import { useDealStore } from "../contexts/DealStoreProvider.tsx";
import { useSnapshot } from "valtio/react";
import { multiTabStore } from "../stores/multiTabStore.ts";
import { memo, useCallback } from "react";

export const DealHeader = memo(() => {
  const dealStore = useDealStore();
  const multiTabStoreSnap = useSnapshot(multiTabStore);

  const handleAddNewProduct = useCallback(() => {
    dealStore.actions.addNewProduct();
  }, [dealStore.actions]);

  return (
    <div className="deal__header">
      <button className="button" onClick={handleAddNewProduct}>
        Add New Product
      </button>

      <button
        className="button"
        onClick={() => {
          multiTabStore.actions.toggleSpotPriceStreamEnabled();
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
