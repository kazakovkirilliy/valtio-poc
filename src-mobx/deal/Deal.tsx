import "../fields/columns.css";
import "./Deal.css";
import { observer } from "mobx-react-lite";
import { columnsGridTemplateRows } from "../fields/fields.ts";
import { LabelColumn } from "../fields/LabelColumn.tsx";
import { GroupColumn } from "../groups/GroupColumn.tsx";
import { useOnMount } from "../lib/useOnMount.ts";
import { DealColumn } from "./DealColumn.tsx";
import { DealHeader } from "./DealHeader.tsx";
import { useDealStore } from "./DealStoreProvider.tsx";

export const Deal = observer(() => {
  const deal = useDealStore();

  useOnMount(() => {
    deal.addNewGroup("VanillaGroup");
  });

  // reads only the group order, so field edits never re-render the deal
  return (
    <section className="deal">
      <DealHeader />

      <div
        className="columns"
        style={{ gridTemplateRows: columnsGridTemplateRows }}
      >
        <DealColumn />
        <LabelColumn />
        {deal.groupIds.map((groupId) => (
          <GroupColumn key={groupId} group={deal.groups[groupId]} />
        ))}
      </div>
    </section>
  );
});

Deal.displayName = "Deal";
