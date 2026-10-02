import { observer } from "mobx-react-lite";
import { toFixingSourceValue } from "../../api/fixingSources.ts";
import type { FieldModel } from "../../stores/fieldModel.ts";
import { fixingSourceStore } from "../../stores/fixingSourceStore.ts";
import { DEFAULT_SETTLEMENT_STYLE } from "../../stores/settlementStyles.ts";
import { Select } from "./Select.tsx";

type Props = {
  field: FieldModel;
  label: string;
  /** The column's settlement style; the deal column holds none and uses the default. */
  settlementStyleField?: FieldModel;
};

/** Fixing Source: options loaded from the API for the column's settlement style. */
export const FixingSourceSelect = observer(
  ({ field, label, settlementStyleField }: Props) => {
    const settlementStyle =
      (settlementStyleField?.value as string | undefined) ||
      DEFAULT_SETTLEMENT_STYLE;
    const loaded = fixingSourceStore.byStyle[settlementStyle];

    return (
      <Select
        label={label}
        value={field.value}
        options={(loaded?.options ?? []).map((option) => ({
          value: toFixingSourceValue(option),
          label: option.name,
        }))}
        status={loaded?.status ?? "loading"}
        hasError={field.issues.length > 0}
        onCommit={(value) => field.commit(value)}
      />
    );
  },
);

FixingSourceSelect.displayName = "FixingSourceSelect";
