import { observer } from "mobx-react-lite";
import { groupDefinitions, groupTypes } from "../groups/groupStore.ts";
import { multiTabStore } from "../multiDeal/multiTabStore.ts";
import { useDealStore } from "./DealStoreProvider.tsx";

export const DealHeader = observer(() => {
  const deal = useDealStore();
  const { devtools } = multiTabStore;

  return (
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

      <button className="button" onClick={devtools.toggleSpotPriceStreamEnabled}>
        Toggle Spot Price Stream (
        {devtools.isSpotPriceStreamEnabled ? "Enabled" : "Disabled"})
      </button>
    </div>
  );
});

DealHeader.displayName = "DealHeader";
