import { memo } from "react";
import { useUnit } from "effector-react";
import { groupDefinitions, groupTypes } from "../stores/groupStore.ts";
import {
  $isSpotPriceStreamEnabled,
  toggleSpotPriceStreamEnabled,
} from "../stores/multiTabStore.ts";
import { useDealStore } from "./DealStoreProvider.tsx";

export const DealHeader = memo(() => {
  const addGroup = useUnit(useDealStore().addGroup);
  const [isSpotPriceStreamEnabled, toggle] = useUnit([
    $isSpotPriceStreamEnabled,
    toggleSpotPriceStreamEnabled,
  ]);

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
