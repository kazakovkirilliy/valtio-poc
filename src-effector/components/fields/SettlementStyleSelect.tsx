import { memo } from "react";
import { settlementStyleOptions } from "../../stores/settlementStyles.ts";
import { Select } from "./Select.tsx";

type Props = {
  label: string;
  value: unknown;
  hasError?: boolean;
  onCommit: (value: string) => void;
};

/**
 * Settlement Style: a fixed list (Cash, Delivery). What picking does (write
 * the product, which reloads its fixing sources, or broadcast) is the caller's.
 */
export const SettlementStyleSelect = memo(
  ({ label, value, hasError = false, onCommit }: Props) => (
    <Select
      label={label}
      value={value}
      options={settlementStyleOptions}
      status="loaded"
      hasError={hasError}
      onCommit={onCommit}
    />
  ),
);

SettlementStyleSelect.displayName = "SettlementStyleSelect";
