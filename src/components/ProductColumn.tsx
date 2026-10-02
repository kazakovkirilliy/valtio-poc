import { memo } from "react";
import { Input } from "./Input.tsx";

type Props = {
  productId: string;
  number: number;
};

export const ProductColumn = memo(({ productId, number }: Props) => {
  return (
    <div className="column" aria-label={`Product ${number}`}>
      <h2>Product {number}</h2>
      <Input
        label="Notional Ccy"
        path={`products.${productId}.productNotionalCcy`}
      />
      <Input
        label="Premium Ccy"
        path={`products.${productId}.productPremiumCcy`}
      />
      <Input label="Strike" path={`products.${productId}.strike`} />
    </div>
  );
});

ProductColumn.displayName = "ProductColumn";
