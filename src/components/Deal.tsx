import { DealColumn } from "./DealColumn.tsx";
import { ProductColumn } from "./ProductColumn.tsx";
import { useDealId, useStoreBindings } from "../contexts/StoreProvider.tsx";
import { DealHeader } from "./DealHeader.tsx";
import { memo } from "react";

export const Deal = memo(() => {
  const bindings = useStoreBindings();
  const productIds = bindings.useProductIds(useDealId());
  return (
      <section className="deal" aria-label="Active deal">
        <DealHeader />
        <div className="columnsContainer">
          <DealColumn />
          {productIds.map((productId, index) => (
            <ProductColumn key={productId} productId={productId} number={index + 1} />
          ))}
        </div>
      </section>
  );
});

Deal.displayName = "Deal";
