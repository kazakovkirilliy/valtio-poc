import { observer } from "mobx-react-lite";
import type { FieldModel } from "../../stores/fieldModel.ts";
import { settlementStyleOptions } from "../../stores/settlementStyles.ts";
import { Select } from "./Select.tsx";

type Props = {
  field: FieldModel;
  label: string;
};

/**
 * Settlement Style: a fixed list (Cash, Delivery). What picking does (write
 * the product and reload its fixing sources, or broadcast) is the field's.
 */
export const SettlementStyleSelect = observer(({ field, label }: Props) => (
  <Select
    label={label}
    value={field.value}
    options={settlementStyleOptions}
    status="loaded"
    hasError={field.issues.length > 0}
    onCommit={(value) => field.commit(value)}
  />
));

SettlementStyleSelect.displayName = "SettlementStyleSelect";
