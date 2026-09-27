import { memo } from "react";
import { Input } from "./Input.tsx";

export const DealColumn = memo(() => {
  return (
    <div className="column">
      <h5>Deal Column</h5>
      <Input label="Notional Ccy" path="notionalCcy" />
      <Input label="Premium Ccy" path="premiumCcy" />
      <Input label="Spot Stream" path={`spotPriceStreamValue`} />
    </div>
  );
});

DealColumn.displayName = "DealColumn";
