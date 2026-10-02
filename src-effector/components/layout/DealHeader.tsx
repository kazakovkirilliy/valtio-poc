import { memo } from "react";
import { useAction, useValue } from "../../hooks/units.ts";
import { groupDefinitions, groupTypes } from "../../stores/groupStore.ts";
import {
  $isSpotPriceStreamEnabled,
  toggleSpotPriceStreamEnabledAction,
} from "../../stores/multiTabStore.ts";
import { useDealStore } from "../providers/DealStoreProvider.tsx";

export const DealHeader = memo(() => {
  const addGroup = useAction(useDealStore().actions.addGroupAction);
  const isSpotPriceStreamEnabled = useValue($isSpotPriceStreamEnabled);
  const toggle = useAction(toggleSpotPriceStreamEnabledAction);

  return (
    <div className="deal__toolbar">
      {groupTypes.map((groupType) => (
        <button
          key={groupType}
          className="button"
          onClick={() => addGroup(groupType)}
        >
          Add {groupDefinitions[groupType].label}
        </button>
      ))}

      <button className="button" onClick={() => toggle()}>
        Toggle Spot Price Stream (
        {isSpotPriceStreamEnabled ? "Enabled" : "Disabled"})
      </button>
    </div>
  );
});

DealHeader.displayName = "DealHeader";
