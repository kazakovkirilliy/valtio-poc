import { DealColumn } from "./DealColumn.tsx";
import { ProductColumn } from "./ProductColumn.tsx";
import {
  useDealStoreSnapshot,
  useDealStore,
} from "../contexts/DealStoreProvider.tsx";
import { DealHeader } from "./DealHeader.tsx";
import { memo } from "react";
import { useOnMount } from "../hooks/useOnMount.ts";

const SingleProduct = memo(({ productId }: { productId: string }) => (
  <ProductColumn key={productId} productId={productId} />
));

SingleProduct.displayName = "SingleProduct";

export const Deal = memo(() => {
  const snap = useDealStoreSnapshot();

  const actions = useDealStore().actions;

  useOnMount(() => {
    actions.addNewProduct();
  });

  return (
    <>
      <section className="deal">
        <DealHeader />

        <div className="columnsContainer">
          <DealColumn />
          {Object.keys(snap.products).map((productId) => (
            <SingleProduct key={productId} productId={productId} />
          ))}
        </div>
      </section>
    </>
  );
});

Deal.displayName = "Deal";
