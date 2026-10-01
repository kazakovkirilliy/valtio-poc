import { useDealStore } from "../contexts/DealStoreProvider.tsx";
import { useProxyValue } from "../hooks/useProxyValue.ts";
import { multiTabStore } from "../stores/multiTabStore.ts";
import { memo, useCallback } from "react";
import {
  type ProductType,
  productTypes,
  productTypeLabels,
} from "../stores/productRegistry.ts";

export const DealHeader = memo(() => {
  const dealStore = useDealStore();
  // multiTabStore contains every deal, so a snapshot of it was notified on
  // every keystroke; the devtools object only changes when toggled
  const isSpotPriceStreamEnabled = useProxyValue(
    multiTabStore.devtools,
    "isSpotPriceStreamEnabled",
  );

  const handleAddNewProduct = useCallback(
    (productType: ProductType) => {
      dealStore.actions.addNewProduct(productType);
    },
    [dealStore.actions],
  );

  return (
    <div className="deal__header">
      {productTypes.map((productType) => (
        <button
          key={productType}
          className="button"
          onClick={() => handleAddNewProduct(productType)}
        >
          Add {productTypeLabels[productType]}
        </button>
      ))}

      <button
        className="button"
        onClick={() => {
          multiTabStore.actions.toggleSpotPriceStreamEnabled();
        }}
      >
        Toggle Spot Price Stream (
        {isSpotPriceStreamEnabled ? "Enabled" : "Disabled"}
        )
      </button>
    </div>
  );
});

DealHeader.displayName = "DealHeader";
