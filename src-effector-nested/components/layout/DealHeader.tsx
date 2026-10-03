import { memo } from "react";
import { useAction, useValue } from "../../hooks/units.ts";
import { CalcBar } from "@shared/components/CalcBar.tsx";
import { groupDefinitions, groupTypes } from "@shared/groups.ts";
import {
  $isAutocalcEnabled,
  $isSpotPriceStreamEnabled,
  toggleAutocalcEnabledAction,
  toggleSpotPriceStreamEnabledAction,
} from "../../stores/multiTabStore.ts";
import { useDealStore } from "../providers/DealStoreProvider.tsx";

export const DealHeader = memo(() => {
  const deal = useDealStore();
  const addGroup = useAction(deal.actions.addGroupAction);
  const isSpotPriceStreamEnabled = useValue($isSpotPriceStreamEnabled);
  const toggle = useAction(toggleSpotPriceStreamEnabledAction);
  const calc = useValue(deal.$calc);
  const isReady = useValue(deal.$isReady);
  const calculate = useAction(deal.actions.calculateAction);
  const isAutocalcEnabled = useValue($isAutocalcEnabled);
  const toggleAutocalc = useAction(toggleAutocalcEnabledAction);

  return (
    <>
    <CalcBar
      calc={calc}
      isReady={isReady}
      isAutocalcEnabled={isAutocalcEnabled}
      onToggleAutocalc={() => toggleAutocalc()}
      onCalculate={() => calculate()}
    />
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
    </>
  );
});

DealHeader.displayName = "DealHeader";
