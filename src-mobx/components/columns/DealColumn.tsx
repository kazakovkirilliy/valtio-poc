import { memo } from "react";
import { FieldCells } from "./FieldCells.tsx";
import { useDealStore } from "../providers/DealStoreProvider.tsx";
import { SpotPriceField } from "../fields/SpotPriceField.tsx";

const custom = { spotStream: <SpotPriceField /> };

/** Field models are fixed per deal, so the column itself never re-renders. */
export const DealColumn = memo(() => {
  const deal = useDealStore();

  return (
    <div className="column">
      <div className="column__header column__header--span">
        <h5 className="column__title">Deal Column</h5>
      </div>
      <FieldCells fields={deal.fields} custom={custom} />
    </div>
  );
});

DealColumn.displayName = "DealColumn";
