import { memo, useMemo } from "react";
import { toFixingSourceValue } from "../../api/fixingSources.ts";
import {
  useDealCommit,
  useDealValue,
  useValidationError,
} from "../../hooks/useDealValue.ts";
import { useProxyValue } from "../../hooks/useProxyValue.ts";
import { fixingSourceStore } from "../../stores/fixingSourceStore.ts";
import { DEFAULT_SETTLEMENT_STYLE } from "../../stores/settlementStyles.ts";
import { Select } from "./Select.tsx";

type Props = {
  path: string;
  label: string;
  /** Deal column: holds nothing (shows "—"); picking pushes into every product. */
  isBroadcasting?: boolean;
  /** The product's settlement style; the deal column has none and uses the default. */
  settlementStylePath?: string;
};

/** Fixing Source: options loaded from the API for the product's settlement style. */
export const FixingSourceSelect = memo(
  ({ path, label, isBroadcasting = false, settlementStylePath }: Props) => {
    const value = useDealValue(path);
    const { hasError } = useValidationError(path);
    const commit = useDealCommit(path, isBroadcasting);
    const settlementStyle =
      (useDealValue(settlementStylePath ?? "") as string | undefined) ||
      DEFAULT_SETTLEMENT_STYLE;
    const loaded = useProxyValue(fixingSourceStore.byStyle, settlementStyle);

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
        value={isBroadcasting ? "" : value}
        options={options}
        status={loaded?.status ?? "loading"}
        hasError={hasError}
        onCommit={commit}
      />
    );
  },
);

FixingSourceSelect.displayName = "FixingSourceSelect";
