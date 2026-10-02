import { memo } from "react";
import { useStoreMap } from "effector-react";
import { useAction } from "../../hooks/units.ts";
import {
  type BroadcastFieldId,
  type SyncedFieldId,
  broadcastFieldIds,
} from "../../stores/dealFields.ts";
import { fieldInputTypes, fieldLabels } from "../../stores/fields.ts";
import { useDealStore } from "../providers/DealStoreProvider.tsx";
import { FieldCells } from "./FieldCells.tsx";
import { Input } from "../fields/Input.tsx";
import { SpotPriceField } from "../fields/SpotPriceField.tsx";

/** Shows the deal value; a commit syncs the deal and every product. */
const SyncedField = memo(({ fieldId }: { fieldId: SyncedFieldId }) => {
  const { $dealFields, actions } = useDealStore();
  const value = useStoreMap({
    store: $dealFields,
    keys: [fieldId],
    fn: (deal, [id]) => deal[id],
  });
  const commit = useAction(actions.commitSyncedFieldAction);

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
  const commit = useAction(useDealStore().actions.broadcastFieldAction);

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
