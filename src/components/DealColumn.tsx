import { memo } from "react";
import { Input } from "./Input.tsx";
import { DateInput } from "./DateInput.tsx";
import { SpotPriceField } from "./SpotPriceField.tsx";
import { FieldCells } from "./FieldCells.tsx";
import { fieldLabels as labels } from "./fieldRows.ts";

/**
 * Notional/Premium Ccy sync two-way with every product. All other fields
 * are broadcasts: committed on blur or Enter, pushed into every product of
 * every group, then cleared.
 */
export const DealColumn = memo(() => {
  return (
    <div className="column">
      <div className="column__header column__header--span">
        <h5>Deal Column</h5>
      </div>
      <FieldCells
        fields={{
          notionalCcy: <Input label={labels.notionalCcy} path="notionalCcy" />,
          notionalAmount: (
            <Input
              label={labels.notionalAmount}
              type="number"
              path="notionalAmount"
              isBroadcasting
            />
          ),
          premiumCcy: <Input label={labels.premiumCcy} path="premiumCcy" />,
          strike: <Input label={labels.strike} path="strike" isBroadcasting />,
          callPut: (
            <Input label={labels.callPut} path="callPut" isBroadcasting />
          ),
          buySell: (
            <Input label={labels.buySell} path="buySell" isBroadcasting />
          ),
          ccyPair: (
            <Input label={labels.ccyPair} path="ccyPair" isBroadcasting />
          ),
          expiryDate: (
            <DateInput
              label={labels.expiryDate}
              path="expiryDate"
              isBroadcasting
            />
          ),
          expiryCut: (
            <Input label={labels.expiryCut} path="expiryCut" isBroadcasting />
          ),
          deliveryDate: (
            <DateInput
              label={labels.deliveryDate}
              path="deliveryDate"
              isBroadcasting
            />
          ),
          premiumDate: (
            <DateInput
              label={labels.premiumDate}
              path="premiumDate"
              isBroadcasting
            />
          ),
          settlementStyle: (
            <Input
              label={labels.settlementStyle}
              path="settlementStyle"
              isBroadcasting
            />
          ),
          settlementCcy: (
            <Input
              label={labels.settlementCcy}
              path="settlementCcy"
              isBroadcasting
            />
          ),
          settlementFixingSource: (
            <Input
              label={labels.settlementFixingSource}
              path="settlementFixingSource"
              isBroadcasting
            />
          ),
          spotStream: <SpotPriceField />,
        }}
      />
    </div>
  );
});

DealColumn.displayName = "DealColumn";
