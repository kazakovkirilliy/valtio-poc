import { useStore } from "zustand";
import { CalcBar } from "@shared/components/CalcBar.tsx";
import { optionsStore } from "../../stores/optionsStore.ts";
import { useDealStore } from "../providers/DealStoreProvider.tsx";
import { selectIsReady } from "../../stores/validation.ts";
import { devtoolsStore, multiTabStore } from "../../stores/multiTabStore.ts";
import { memo, useCallback } from "react";
import {
  type GroupType,
  groupTypes,
  groupDefinitions,
} from "@shared/groups.ts";

export const DealHeader = memo(() => {
  const dealStore = useDealStore();
  // each selector re-renders only when its own value changes; actions never
  // change, so they're read with `getState()`, not selected
  const isSpotPriceStreamEnabled = useStore(
    devtoolsStore,
    (state) => state.isSpotPriceStreamEnabled,
  );

  const isAutocalcEnabled = useStore(devtoolsStore, (state) => state.isAutocalcEnabled);
  const calc = useStore(dealStore, (state) => state.calc);
  const pending = useStore(optionsStore, (state) => state.pending);
  // a boolean: re-renders when readiness flips, not on every edit
  const isReady = useStore(dealStore, (state) => selectIsReady(state, pending));

  const handleAddNewGroup = useCallback(
    (groupType: GroupType) => {
      dealStore.getState().actions.addNewGroup(groupType);
    },
    [dealStore],
  );

  return (
    <>
    <CalcBar
      calc={calc}
      isReady={isReady}
      isAutocalcEnabled={isAutocalcEnabled}
      onToggleAutocalc={multiTabStore.getState().actions.toggleAutocalcEnabled}
      onCalculate={dealStore.getState().actions.calculate}
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
          multiTabStore.getState().actions.toggleSpotPriceStreamEnabled();
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
