import "./columns.css";
import "./Deal.css";
import { memo } from "react";
import { columnsGridTemplateRows } from "../stores/fields.ts";
import { useAction, useValue } from "../hooks/units.ts";
import { useOnMount } from "../hooks/useOnMount.ts";
import { DealColumn } from "./DealColumn.tsx";
import { DealHeader } from "./DealHeader.tsx";
import { useDealStore } from "./DealStoreProvider.tsx";
import { GroupColumn } from "./GroupColumn.tsx";
import { LabelColumn } from "./LabelColumn.tsx";

export const Deal = memo(() => {
  const deal = useDealStore();
  // only the group order: field edits never re-render the deal
  const groupIds = useValue(deal.$groupOrder);
  const addGroup = useAction(deal.actions.addGroup);

  useOnMount(() => {
    addGroup("VanillaGroup");
  });

  return (
    <section className="deal">
      <DealHeader />

      <div
        className="columns"
        style={{ gridTemplateRows: columnsGridTemplateRows }}
      >
        <DealColumn />
        <LabelColumn />
        {groupIds.map((groupId) => (
          <GroupColumn key={groupId} groupId={groupId} />
        ))}
      </div>
    </section>
  );
});

Deal.displayName = "Deal";
