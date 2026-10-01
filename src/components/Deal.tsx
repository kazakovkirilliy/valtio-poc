import { DealColumn } from "./DealColumn.tsx";
import { ProductColumn } from "./ProductColumn.tsx";
import { VanillaProductColumn } from "./VanillaProductColumn.tsx";
import { useDealStore } from "../contexts/DealStoreProvider.tsx";
import { DealHeader } from "./DealHeader.tsx";
import { memo, type ComponentType } from "react";
import { useOnMount } from "../hooks/useOnMount.ts";
import { useProxyKeys } from "../hooks/useProxyValue.ts";
import {
  type ProductType,
  getProductType,
} from "../stores/productRegistry.ts";

const productColumns: Record<
  ProductType,
  ComponentType<{ productId: string }>
> = {
  Product: ProductColumn,
  VanillaProduct: VanillaProductColumn,
};

const SingleProduct = memo(
  ({
    productId,
    productType,
  }: {
    productId: string;
    productType: ProductType;
  }) => {
    const Column = productColumns[productType];
    return <Column productId={productId} />;
  },
);

SingleProduct.displayName = "SingleProduct";

export const Deal = memo(() => {
  const { products, actions } = useDealStore();
  // re-renders only when products are added or removed, not on field edits
  const productIds = useProxyKeys(products);

  useOnMount(() => {
    actions.addNewProduct("Product");
  });

  return (
    <>
      <section className="deal">
        <DealHeader />

        <div className="columnsContainer">
          <DealColumn />
          {productIds.map((productId) => (
            <SingleProduct
              key={productId}
              productId={productId}
              // fixed at creation, so reading the proxy needs no subscription
              productType={getProductType(products[productId])}
            />
          ))}
        </div>
      </section>
    </>
  );
});

Deal.displayName = "Deal";
