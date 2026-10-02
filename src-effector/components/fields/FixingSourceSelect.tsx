import { memo, useMemo } from "react";
import { useStoreMap } from "effector-react";
import { toFixingSourceValue } from "../../api/fixingSources.ts";
import { $fixingSourcesByStyle } from "../../stores/fixingSourceStore.ts";
import { Select } from "./Select.tsx";

type Props = {
  label: string;
  /** Picks which options to show: those loaded for this style. */
  settlementStyle: string;
  value: unknown;
  hasError?: boolean;
  onCommit: (value: string) => void;
};

/** Fixing Source: options loaded from the API for a settlement style. */
export const FixingSourceSelect = memo(
  ({ label, settlementStyle, value, hasError = false, onCommit }: Props) => {
    const loaded = useStoreMap({
      store: $fixingSourcesByStyle,
      keys: [settlementStyle],
      fn: (byStyle, [style]) => byStyle[style] ?? null,
    });

    const options = useMemo(
      () =>
        (loaded?.options ?? []).map((option) => ({
          value: toFixingSourceValue(option),
          label: option.name,
        })),
      [loaded],
    );

    return (
      <Select
        label={label}
        value={value}
        options={options}
        status={loaded?.status ?? "loading"}
        hasError={hasError}
        onCommit={onCommit}
      />
    );
  },
);

FixingSourceSelect.displayName = "FixingSourceSelect";
