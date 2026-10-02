import { memo } from "react";
import { useStoreMap, useUnit } from "effector-react";
import {
  type BroadcastFieldId,
  type SyncedFieldId,
  broadcastFieldIds,
} from "../stores/dealFields.ts";
import { fieldInputTypes, fieldLabels } from "../stores/fields.ts";
import { useDealStore } from "./DealStoreProvider.tsx";
import { FieldCells } from "./FieldCells.tsx";
import { Input } from "./Input.tsx";
import { SpotPriceField } from "./SpotPriceField.tsx";

/** Shows the deal value; a commit syncs the deal and every product. */
const SyncedField = memo(({ fieldId }: { fieldId: SyncedFieldId }) => {
  const { $dealFields, syncedFieldCommitted } = useDealStore();
  const value = useStoreMap({
    store: $dealFields,
    keys: [fieldId],
    fn: (deal, [id]) => deal[id],
  });
  const commit = useUnit(syncedFieldCommitted);

  return (
    <Input
      label={fieldLabels[fieldId]}
      type={fieldInputTypes[fieldId]}
      value={value}
      onCommit={(next) => commit({ fieldId, value: String(next) })}
    />
  );
});

SyncedField.displayName = "SyncedField";

/** Holds nothing (shows empty); a commit pushes the value into every product. */
const BroadcastField = memo(({ fieldId }: { fieldId: BroadcastFieldId }) => {
  const commit = useUnit(useDealStore().broadcastCommitted);

  return (
    <Input
      label={fieldLabels[fieldId]}
      type={fieldInputTypes[fieldId]}
      value={undefined}
      onCommit={(value) => commit({ fieldId, value })}
    />
  );
});

BroadcastField.displayName = "BroadcastField";

const fields = {
  notionalCcy: <SyncedField fieldId="notionalCcy" />,
  premiumCcy: <SyncedField fieldId="premiumCcy" />,
  ...Object.fromEntries(
    broadcastFieldIds.map((id) => [id, <BroadcastField fieldId={id} />]),
  ),
  spotStream: <SpotPriceField />,
};

export const DealColumn = memo(() => (
  <div className="column">
    <div className="column__header column__header--span">
      <h5 className="column__title">Deal Column</h5>
    </div>
    <FieldCells fields={fields} />
  </div>
));

DealColumn.displayName = "DealColumn";
