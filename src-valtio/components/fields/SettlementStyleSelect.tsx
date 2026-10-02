import { memo, useMemo } from "react";
import { toSettlementStyleValue } from "../../api/settlementStyles.ts";
import { useDealValue, useValidationError } from "../../hooks/useDealValue.ts";
import { useProxyValue } from "../../hooks/useProxyValue.ts";
import { settlementStyleStore } from "../../stores/settlementStyleStore.ts";
import { useDealStore } from "../providers/DealStoreProvider.tsx";
import { type OptionsStatus, Select } from "./Select.tsx";

type Props = {
  path: string;
  label: string;
  /** Deal column: holds nothing (shows "—"); picking pushes into every product. */
  isBroadcasting?: boolean;
};

/** Settlement Style, as a dropdown over the options loaded from the API. */
export const SettlementStyleSelect = memo(
  ({ path, label, isBroadcasting = false }: Props) => {
    const actions = useDealStore().actions;
    const value = useDealValue(path);
    const { hasError } = useValidationError(path);
    const status = useProxyValue(settlementStyleStore, "status");
    const options = useProxyValue(settlementStyleStore, "options");

    const selectOptions = useMemo(
      () =>
        options.map((option) => ({
          value: toSettlementStyleValue(option),
          label: option.name,
        })),
      [options],
    );
    const selectStatus: OptionsStatus =
      status === "loaded" || status === "error" ? status : "loading";

    const commit = (next: string) => {
      if (!isBroadcasting) return actions.setValueByPath(path, next);
      if (!next) return; // nothing to broadcast
      actions.setValueByPath(path, next);
      actions.setValueByPath(path, undefined);
    };

    return (
      <Select
        label={label}
        value={isBroadcasting ? "" : value}
        options={selectOptions}
        status={selectStatus}
        hasError={hasError}
        onCommit={commit}
      />
    );
  },
);

SettlementStyleSelect.displayName = "SettlementStyleSelect";
