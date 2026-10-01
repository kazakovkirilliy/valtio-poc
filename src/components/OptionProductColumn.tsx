import { memo } from "react";
import { Input } from "./Input.tsx";
import { DateInput } from "./DateInput.tsx";
import { ProductColumnHeader } from "./ProductColumnHeader.tsx";
import { FieldCells } from "./FieldCells.tsx";
import { fieldLabels as labels } from "./fieldRows.ts";
import type { CommonKey } from "../stores/optionProduct.ts";

type Props = {
  productPath: string; // the product's path from the deal
};

/** Shared column of the option products; they differ only in `commonKey`. */
const OptionProductColumn = memo(
  ({ productPath, commonKey }: Props & { commonKey: CommonKey }) => {
    const data = `${productPath}.data`;
    const common = `${data}.${commonKey}`;
    const base = `${common}.base`;

    return (
      <div className="column">
        <ProductColumnHeader productPath={productPath} />
        <FieldCells
          fields={{
            notionalCcy: (
              <Input
                label={labels.notionalCcy}
                path={`${base}.notional.notionalCcy`}
              />
            ),
            notionalAmount: (
              <Input
                label={labels.notionalAmount}
                type="number"
                path={`${base}.notional.amount`}
              />
            ),
            premiumCcy: (
              <Input label={labels.premiumCcy} path={`${base}.premiumCcy`} />
            ),
            strike: <Input label={labels.strike} path={`${common}.strike`} />,
            callPut: (
              <Input label={labels.callPut} path={`${common}.callPut`} />
            ),
            buySell: <Input label={labels.buySell} path={`${base}.buySell`} />,
            ccyPair: <Input label={labels.ccyPair} path={`${base}.ccyPair`} />,
            expiryDate: (
              <DateInput
                label={labels.expiryDate}
                path={`${base}.expiryDate`}
              />
            ),
            expiryDays: (
              <Input
                label={labels.expiryDays}
                type="number"
                path={`${base}.expiryDays`}
                inputProps={{ readOnly: true }}
              />
            ),
            expiryCut: (
              <Input label={labels.expiryCut} path={`${base}.expiryCut`} />
            ),
            deliveryDate: (
              <DateInput
                label={labels.deliveryDate}
                path={`${base}.deliveryDate`}
              />
            ),
            premiumDate: (
              <DateInput
                label={labels.premiumDate}
                path={`${base}.premiumDate`}
              />
            ),
            settlementStyle: (
              <Input
                label={labels.settlementStyle}
                path={`${data}.settlementStyle`}
              />
            ),
            settlementCcy: (
              <Input
                label={labels.settlementCcy}
                path={`${data}.cashSettlement.settlementCcy`}
              />
            ),
            settlementFixingSource: (
              <Input
                label={labels.settlementFixingSource}
                path={`${data}.cashSettlement.settlementFixingSource`}
              />
            ),
          }}
        />
      </div>
    );
  },
);

OptionProductColumn.displayName = "OptionProductColumn";

export const VanillaProductColumn = memo(({ productPath }: Props) => (
  <OptionProductColumn productPath={productPath} commonKey="optionsCommon" />
));

VanillaProductColumn.displayName = "VanillaProductColumn";

export const AverageProductColumn = memo(({ productPath }: Props) => (
  <OptionProductColumn productPath={productPath} commonKey="avroCommon" />
));

AverageProductColumn.displayName = "AverageProductColumn";
