import { useDealStore } from "./DealStoreProvider.tsx";
import { useProxyValue } from "../lib/useProxyValue.ts";
import { multiTabStore } from "../multiDeal/multiTabStore.ts";
import { memo, useCallback } from "react";
import {
  type GroupType,
  groupTypes,
  groupDefinitions,
} from "../groups/groupStore.ts";

export const DealHeader = memo(() => {
  const dealStore = useDealStore();
  // multiTabStore contains every deal, so a snapshot of it was notified on
  // every keystroke; the devtools object only changes when toggled
  const isSpotPriceStreamEnabled = useProxyValue(
    multiTabStore.devtools,
    "isSpotPriceStreamEnabled",
  );

  const handleAddNewGroup = useCallback(
    (groupType: GroupType) => {
      dealStore.actions.addNewGroup(groupType);
    },
    [dealStore.actions],
  );

  return (
    <div className="deal__toolbar">
      {groupTypes.map((groupType) => (
        <button
          key={groupType}
          className="button"
          onClick={() => handleAddNewGroup(groupType)}
        >
          Add {groupDefinitions[groupType].label}
        </button>
      ))}

      <button
        className="button"
        onClick={() => {
          multiTabStore.actions.toggleSpotPriceStreamEnabled();
        }}
      >
        Toggle Spot Price Stream (
        {isSpotPriceStreamEnabled ? "Enabled" : "Disabled"}
        )
      </button>
    </div>
  );
});

DealHeader.displayName = "DealHeader";
