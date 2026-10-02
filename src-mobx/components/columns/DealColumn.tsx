import { memo, useMemo } from "react";
import { FieldCells } from "@shared/components/FieldCells.tsx";
import { SpotPriceField } from "@shared/components/SpotPriceField.tsx";
import type { FieldId } from "@shared/fields.ts";
import { ModelField } from "../fields/ModelField.tsx";
import { useDealStore } from "../providers/DealStoreProvider.tsx";

/** Field models are fixed per deal, so the column itself never re-renders. */
export const DealColumn = memo(() => {
  const deal = useDealStore();
  const fields = useMemo(
    () => ({
      ...Object.fromEntries(
        Object.entries(deal.fields).map(([fieldId, field]) => [
          fieldId,
          <ModelField fieldId={fieldId as FieldId} field={field} />,
        ]),
      ),
      spotStream: <SpotPriceField spotPriceStream={deal.spotPriceStream} />,
    }),
    [deal],
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
