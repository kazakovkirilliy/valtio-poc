import { observer } from "mobx-react-lite";
import { toSettlementStyleValue } from "../../api/settlementStyles.ts";
import type { FieldModel } from "../../stores/fieldModel.ts";
import { settlementStyleStore } from "../../stores/settlementStyleStore.ts";
import { Select } from "./Select.tsx";

type Props = {
  field: FieldModel;
  label: string;
};

/**
 * Settlement Style, as a dropdown over the options loaded from the API. What
 * picking an option does (write the product, broadcast) is the field model's.
 */
export const SettlementStyleSelect = observer(({ field, label }: Props) => {
  const { status, options } = settlementStyleStore;

  return (
    <Select
      label={label}
      value={field.value}
      options={options.map((option) => ({
        value: toSettlementStyleValue(option),
        label: option.name,
      }))}
      status={status === "loaded" || status === "error" ? status : "loading"}
      hasError={field.issues.length > 0}
      onCommit={(value) => field.commit(value)}
    />
  );
});

SettlementStyleSelect.displayName = "SettlementStyleSelect";
