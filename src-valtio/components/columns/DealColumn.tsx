import { memo } from "react";
import { FieldCells, type FieldBindings } from "./FieldCells.tsx";
import { dealBroadcastKeys } from "../../stores/dealBroadcasts.ts";
import { SpotPriceField } from "../fields/SpotPriceField.tsx";

/**
 * Notional/Premium Ccy sync two-way with every product. All other fields
 * are broadcasts: committed on blur or Enter, pushed into every product of
 * every group, then cleared. Deal keys are named after their field ids.
 */
const bindings: FieldBindings = {
  notionalCcy: { path: "notionalCcy" },
  premiumCcy: { path: "premiumCcy" },
  ...Object.fromEntries(
    dealBroadcastKeys.map((key) => [key, { path: key, isBroadcasting: true }]),
  ),
};

const custom = { spotStream: <SpotPriceField /> };

export const DealColumn = memo(() => (
  <div className="column">
    <div className="column__header column__header--span">
      <h5 className="column__title">Deal Column</h5>
    </div>
    <FieldCells bindings={bindings} custom={custom} />
  </div>
));

DealColumn.displayName = "DealColumn";
