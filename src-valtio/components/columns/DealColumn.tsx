import { memo, useMemo } from "react";
import { FieldCells } from "@shared/components/FieldCells.tsx";
import { SpotPriceField } from "@shared/components/SpotPriceField.tsx";
import { broadcastFieldIds, syncedFieldIds } from "@shared/dealFields.ts";
import { BoundField } from "../fields/BoundField.tsx";
import { useDealStore } from "../providers/DealStoreProvider.tsx";

/**
 * Synced fields (Notional/Premium Ccy) are two-way with every product. All
 * others are broadcasts: committed into every product of every group, then
 * cleared. Deal keys are named after their field ids.
 */
export const DealColumn = memo(() => {
  const { spotPriceStream } = useDealStore();
  const fields = useMemo(
    () => ({
      ...Object.fromEntries(
        syncedFieldIds.map((id) => [id, <BoundField fieldId={id} path={id} />]),
      ),
      ...Object.fromEntries(
        broadcastFieldIds.map((id) => [id, <BoundField fieldId={id} path={id} isBroadcasting />]),
      ),
      spotStream: <SpotPriceField spotPriceStream={spotPriceStream} />,
    }),
    [spotPriceStream],
  );

  return (
    <div className="column">
      <div className="column__header column__header--span">
        <h5 className="column__title">Deal Column</h5>
      </div>
      <FieldCells fields={fields} />
    </div>
  );
});

DealColumn.displayName = "DealColumn";
