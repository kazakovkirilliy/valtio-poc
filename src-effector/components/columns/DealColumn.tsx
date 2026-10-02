import { memo, useMemo } from "react";
import { useStoreMap } from "effector-react";
import { FieldCells } from "@shared/components/FieldCells.tsx";
import { SpotPriceField } from "@shared/components/SpotPriceField.tsx";
import {
  type BroadcastFieldId,
  type SyncedFieldId,
  broadcastFieldIds,
  syncedFieldIds,
} from "@shared/dealFields.ts";
import { useAction } from "../../hooks/units.ts";
import { Field } from "../fields/Field.tsx";
import { useDealStore } from "../providers/DealStoreProvider.tsx";

/** Shows the deal value; setting it syncs the deal and every product. */
const SyncedField = memo(({ fieldId }: { fieldId: SyncedFieldId }) => {
  const { $dealFields, actions } = useDealStore();
  const value = useStoreMap({
    store: $dealFields,
    keys: [fieldId],
    fn: (deal, [id]) => deal[id],
  });
  const setTwoWaySync = useAction(actions.setTwoWaySyncAction);

  return (
    <Field
      fieldId={fieldId}
      value={value}
      onCommit={(next) => setTwoWaySync({ fieldId, value: String(next) })}
    />
  );
});

SyncedField.displayName = "SyncedField";

/**
 * Holds nothing (shows empty); setting it pushes the value into every product.
 * Async options: the deal has no value of its own to depend on, so it offers
 * the default parameter's options.
 */
const BroadcastField = memo(({ fieldId }: { fieldId: BroadcastFieldId }) => {
  const broadcast = useAction(useDealStore().actions.broadcastFieldAction);
  return <Field fieldId={fieldId} value={undefined} onCommit={(value) => broadcast({ fieldId, value })} />;
});

BroadcastField.displayName = "BroadcastField";

export const DealColumn = memo(() => {
  const { spotPriceStream } = useDealStore();
  const fields = useMemo(
    () => ({
      ...Object.fromEntries(syncedFieldIds.map((id) => [id, <SyncedField fieldId={id} />])),
      ...Object.fromEntries(broadcastFieldIds.map((id) => [id, <BroadcastField fieldId={id} />])),
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
