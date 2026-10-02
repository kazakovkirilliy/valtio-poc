import { memo } from "react";
import { BroadcastStrikeField, Input } from "./Input.tsx";
import { SpotPriceField } from "./SpotPriceField.tsx";

export const DealColumn = memo(() => {
  return (
    <div className="column" aria-label="Deal fields">
      <h2>Deal</h2>
      <Input label="Notional Ccy" path="notionalCcy" />
      <Input label="Premium Ccy" path="premiumCcy" />
      <BroadcastStrikeField />
      <SpotPriceField />
    </div>
  );
});

DealColumn.displayName = "DealColumn";
