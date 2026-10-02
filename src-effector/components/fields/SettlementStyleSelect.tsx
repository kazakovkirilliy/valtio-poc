import { memo, useMemo } from "react";
import { toSettlementStyleValue } from "../../api/settlementStyles.ts";
import { useValue } from "../../hooks/units.ts";
import {
  $settlementStyles,
  $settlementStylesStatus,
} from "../../stores/settlementStyleStore.ts";
import { Select } from "./Select.tsx";

type Props = {
  label: string;
  value: unknown;
  hasError?: boolean;
  onCommit: (value: string) => void;
};

/**
 * Settlement Style, as a dropdown over the options loaded from the API. What
 * picking an option does (write the product, broadcast) is up to the caller.
 */
export const SettlementStyleSelect = memo(
  ({ label, value, hasError = false, onCommit }: Props) => {
    const status = useValue($settlementStylesStatus);
    const options = useValue($settlementStyles);

    const selectOptions = useMemo(
      () =>
        options.map((option) => ({
          value: toSettlementStyleValue(option),
          label: option.name,
        })),
      [options],
    );

    return (
      <Select
        label={label}
        value={value}
        options={selectOptions}
        status={status === "loaded" || status === "error" ? status : "loading"}
        hasError={hasError}
        onCommit={onCommit}
      />
    );
  },
);

SettlementStyleSelect.displayName = "SettlementStyleSelect";
