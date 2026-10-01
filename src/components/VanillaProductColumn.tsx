import { memo } from "react";
import { Input } from "./Input.tsx";
import { DateInput } from "./DateInput.tsx";
import { ProductColumnHeader } from "./ProductColumnHeader.tsx";

type Props = {
  productId: string;
};

export const VanillaProductColumn = memo(({ productId }: Props) => {
  const data = `products.${productId}.data`;
  const optionsCommon = `${data}.optionsCommon`;
  const base = `${optionsCommon}.base`;

  return (
    <div className="column">
      <ProductColumnHeader productId={productId} />
      <Input label="Notional Ccy" path={`${base}.notional.notionalCcy`} />
      <Input
        label="Notional Amount"
        type="number"
        path={`${base}.notional.amount`}
      />
      <Input label="Premium Ccy" path={`${base}.premiumCcy`} />
      <Input label="Strike" path={`${optionsCommon}.strike`} />
      <Input label="Call / Put" path={`${optionsCommon}.callPut`} />
      <Input label="Buy / Sell" path={`${base}.buySell`} />
      <Input label="Ccy Pair" path={`${base}.ccyPair`} />
      <DateInput label="Expiry Date" path={`${base}.expiryDate`} />
      <Input
        label="Expiry Days"
        type="number"
        path={`${base}.expiryDays`}
        inputProps={{ readOnly: true }}
      />
      <Input label="Expiry Cut" path={`${base}.expiryCut`} />
      <DateInput label="Delivery Date" path={`${base}.deliveryDate`} />
      <DateInput label="Premium Date" path={`${base}.premiumDate`} />
      <Input label="Settlement Style" path={`${data}.settlementStyle`} />
      <Input
        label="Settlement Ccy"
        path={`${data}.cashSettlement.settlementCcy`}
      />
      <Input
        label="Fixing Source"
        path={`${data}.cashSettlement.settlementFixingSource`}
      />
    </div>
  );
});

VanillaProductColumn.displayName = "VanillaProductColumn";
