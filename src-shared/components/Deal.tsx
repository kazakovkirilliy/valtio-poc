import { memo } from "react";
import { useDealId, useStoreBindings } from "../StoreProvider.tsx";
import { broadcastFieldIds, groupDefinitions, groupTypes, isSyncedField } from "../domain.ts";
import { columnsGridTemplateRows, fields } from "../fields.ts";
import { Input, BroadcastInput } from "./Input.tsx";
import { SpotPriceField } from "./SpotPriceField.tsx";
import { GroupColumn } from "./GroupColumn.tsx";

const DealHeader = memo(() => {
  const bindings = useStoreBindings();
  const dealId = useDealId();
  const actions = bindings.getDealActions(dealId);
  const workspace = bindings.useWorkspace();
  const meta = bindings.useDealMeta(dealId);
  return (
    <div className="deal__toolbar">
      {groupTypes.map((type) => <button className="button" key={type}
        onClick={() => actions.addGroup(type)}>Add {groupDefinitions[type].label}</button>)}
      <button className="button" onClick={workspace.actions.toggleSpotPriceStream}>
        Toggle Spot Price Stream ({workspace.streamEnabled ? "Enabled" : "Disabled"})
      </button>
      <label><input type="checkbox" checked={meta.isInternal}
        onChange={(event) => actions.setInternal(event.target.checked)} /> Internal deal</label>
      <span>Hedge types: <strong>{meta.hedgeTypes.join(", ")}</strong></span>
      <span role="status" className={meta.hasValidationErrors ? "field-error" : ""}>
        {meta.hasValidationErrors ? "Product validation errors" : "All products valid"}
      </span>
    </div>
  );
});
DealHeader.displayName = "DealHeader";

const DealColumn = memo(() => (
  <div className="column" aria-label="Deal fields">
    <div className="column__header column__header--span"><h2 className="column__title">Deal Column</h2></div>
    {fields.map(({ id, label, input }) => (
      <div className="cell" key={id}>
        {id === "spotStream" ? <SpotPriceField /> : isSyncedField(id) ? (
          <Input target={{ scope: "deal", field: id }} path={id} label={label} type={input} />
        ) : broadcastFieldIds.some((field) => field === id) ? (
          <BroadcastInput field={id as (typeof broadcastFieldIds)[number]} label={label} type={input} />
        ) : null}
      </div>
    ))}
  </div>
));
DealColumn.displayName = "DealColumn";

export const Deal = memo(() => {
  const bindings = useStoreBindings();
  const groupIds = bindings.useGroupIds(useDealId());
  return (
    <section className="deal" aria-label="Active deal">
      <DealHeader />
      <div className="columns" style={{ gridTemplateRows: columnsGridTemplateRows }}>
        <DealColumn />
        <div className="column column--labels">
          <div className="column__header column__header--span" />
          {fields.map(({ id, label }) => <div key={id} className="cell cell--label">{label}</div>)}
        </div>
        {groupIds.map((groupId) => <GroupColumn key={groupId} groupId={groupId} />)}
      </div>
    </section>
  );
});
Deal.displayName = "Deal";
