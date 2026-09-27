import { DealColumn } from "./DealColumn.tsx";
import { ProductColumn } from "./ProductColumn.tsx";
import { useDealStoreSnapshot } from "../contexts/DealStoreProvider.tsx";
import { multiTabStore } from "../stores/multiTabStore.ts";
import { useSnapshot } from "valtio/react";

export const SingleDeal = () => {
  const snap = useDealStoreSnapshot();
  const multiTabStoreSnap = useSnapshot(multiTabStore);

  return (
    <>
      <section className="deal">
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

        <div className="columnsContainer">
          <DealColumn />
          {Object.keys(snap.products).map((productId) => (
            <ProductColumn key={productId} productId={productId} />
          ))}
        </div>
      </section>
    </>
  );
};
