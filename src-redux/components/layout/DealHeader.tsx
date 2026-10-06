import { memo, useCallback } from "react";
import { CalcBar } from "@shared/components/CalcBar.tsx";
import { groupDefinitions, groupTypes } from "@shared/groups.ts";
import { autocalcToggled, spotPriceStreamToggled } from "../../stores/devtoolsSlice.ts";
import { selectIsReady } from "../../stores/selectors.ts";
import { addGroup, calculate } from "../../stores/thunks.ts";
import { useAppDispatch, useAppSelector } from "../../hooks.ts";
import { useDealId } from "../providers/DealIdProvider.tsx";

/** Re-renders only for what it selects: the calculation, readiness and the two switches. */
export const DealHeader = memo(() => {
  const dealId = useDealId();
  const dispatch = useAppDispatch();
  const calc = useAppSelector((state) => state.deals[dealId]?.calc);
  const isReady = useAppSelector((state) => selectIsReady(state, dealId));
  const isAutocalcEnabled = useAppSelector((state) => state.devtools.isAutocalcEnabled);
  const isSpotPriceStreamEnabled = useAppSelector((state) => state.devtools.isSpotPriceStreamEnabled);
  const toggleAutocalc = useCallback(() => dispatch(autocalcToggled()), [dispatch]);
  const onCalculate = useCallback(() => dispatch(calculate(dealId)), [dispatch, dealId]);

  // the deal can be gone for a moment (time travel), before its tab unmounts
  if (!calc) return null;

  return (
    <>
    <CalcBar
      calc={calc}
      isReady={isReady}
      isAutocalcEnabled={isAutocalcEnabled}
      onToggleAutocalc={toggleAutocalc}
      onCalculate={onCalculate}
    />
    <div className="deal__toolbar">
      {groupTypes.map((groupType) => (
        <button
          key={groupType}
          className="button"
          onClick={() => dispatch(addGroup(dealId, groupType))}
        >
          Add {groupDefinitions[groupType].label}
        </button>
      ))}

      <button className="button" onClick={() => dispatch(spotPriceStreamToggled())}>
        Toggle Spot Price Stream (
        {isSpotPriceStreamEnabled ? "Enabled" : "Disabled"})
      </button>
    </div>
    </>
  );
});

DealHeader.displayName = "DealHeader";
