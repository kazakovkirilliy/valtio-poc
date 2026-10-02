import "@shared/styles/columns.css";
import "@shared/styles/deal.css";
import { memo } from "react";
import { columnsGridTemplateRows } from "@shared/fields.ts";
import { useAction, useValue } from "../../hooks/units.ts";
import { useOnMount } from "@shared/hooks/useOnMount.ts";
import { DealColumn } from "../columns/DealColumn.tsx";
import { DealHeader } from "./DealHeader.tsx";
import { useDealStore } from "../providers/DealStoreProvider.tsx";
import { GroupColumn } from "../columns/GroupColumn.tsx";
import { LabelColumn } from "@shared/components/LabelColumn.tsx";

export const Deal = memo(() => {
  const deal = useDealStore();
  // only the group ids: field edits never re-render the deal
  const groupIds = useValue(deal.$groupIds);
  const addGroup = useAction(deal.actions.addGroupAction);

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
