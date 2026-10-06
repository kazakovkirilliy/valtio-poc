import { memo } from "react";
import { useValue } from "@legendapp/state/react";
import { CalcBar } from "@shared/components/CalcBar.tsx";
import { groupDefinitions, groupTypes } from "@shared/groups.ts";
import { devtools$ } from "../../stores/multiTabStore.ts";
import { useDealStore } from "../providers/DealStoreProvider.tsx";

const toggleAutocalc = () => devtools$.isAutocalcEnabled.toggle();
const toggleSpotPriceStream = () => devtools$.isSpotPriceStreamEnabled.toggle();

/** Re-renders only for what it reads: the calculation, readiness and the two switches. */
export const DealHeader = memo(() => {
  const deal = useDealStore();
  const calc = useValue(deal.deal$.calc);
  const isReady = useValue(deal.isReady$);
  const isAutocalcEnabled = useValue(devtools$.isAutocalcEnabled);
  const isSpotPriceStreamEnabled = useValue(devtools$.isSpotPriceStreamEnabled);

  return (
    <>
    <CalcBar
      calc={calc}
      isReady={isReady}
      isAutocalcEnabled={isAutocalcEnabled}
      onToggleAutocalc={toggleAutocalc}
      onCalculate={deal.calculate}
    />
    <div className="deal__toolbar">
      {groupTypes.map((groupType) => (
        <button
          key={groupType}
          className="button"
          onClick={() => deal.addNewGroup(groupType)}
        >
          Add {groupDefinitions[groupType].label}
        </button>
      ))}

      <button className="button" onClick={toggleSpotPriceStream}>
        Toggle Spot Price Stream (
        {isSpotPriceStreamEnabled ? "Enabled" : "Disabled"})
      </button>
    </div>
    </>
  );
});

DealHeader.displayName = "DealHeader";
