import { memo } from "react";
import {
  useDealCommit,
  useDealValue,
  useValidationError,
} from "../../hooks/useDealValue.ts";
import { settlementStyleOptions } from "../../stores/settlementStyles.ts";
import { Select } from "./Select.tsx";

type Props = {
  path: string;
  label: string;
  /** Deal column: holds nothing (shows "—"); picking pushes into every product. */
  isBroadcasting?: boolean;
};

/** Settlement Style: a fixed list (Cash, Delivery). */
export const SettlementStyleSelect = memo(
  ({ path, label, isBroadcasting = false }: Props) => {
    const value = useDealValue(path);
    const { hasError } = useValidationError(path);
    const commit = useDealCommit(path, isBroadcasting);

    return (
      <Select
        label={label}
        value={isBroadcasting ? "" : value}
        options={settlementStyleOptions}
        status="loaded"
        hasError={hasError}
        onCommit={commit}
      />
    );
  },
);

SettlementStyleSelect.displayName = "SettlementStyleSelect";
