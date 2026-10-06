import { useAtomValue } from "jotai/react";
import { CalcBar } from "@shared/components/CalcBar.tsx";
import { useDealStore } from "../providers/DealStoreProvider.tsx";
import { multiTabStore } from "../../stores/multiTabStore.ts";
import { memo, useCallback } from "react";
import {
  type GroupType,
  groupTypes,
  groupDefinitions,
} from "@shared/groups.ts";

export const DealHeader = memo(() => {
  const dealStore = useDealStore();
  // one atom per value read: re-renders only when the switches, the price
  // or the readiness change
  const { isSpotPriceStreamEnabled, isAutocalcEnabled } = useAtomValue(
    multiTabStore.devtoolsAtom,
  );
  const calc = useAtomValue(dealStore.calcAtom);
  const isReady = useAtomValue(dealStore.isReadyAtom);

  const handleAddNewGroup = useCallback(
    (groupType: GroupType) => {
      dealStore.actions.addNewGroup(groupType);
    },
    [dealStore.actions],
  );

  return (
    <>
    <CalcBar
      calc={calc}
      isReady={isReady}
      isAutocalcEnabled={isAutocalcEnabled}
      onToggleAutocalc={multiTabStore.actions.toggleAutocalcEnabled}
      onCalculate={dealStore.actions.calculate}
    />
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
    </>
  );
});

DealHeader.displayName = "DealHeader";
