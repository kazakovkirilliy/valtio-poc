import "../columns/columns.css";
import "./Deal.css";
import { observer } from "mobx-react-lite";
import { columnsGridTemplateRows } from "../../stores/fields.ts";
import { LabelColumn } from "../columns/LabelColumn.tsx";
import { GroupColumn } from "../columns/GroupColumn.tsx";
import { useOnMount } from "../../hooks/useOnMount.ts";
import { DealColumn } from "../columns/DealColumn.tsx";
import { DealHeader } from "./DealHeader.tsx";
import { useDealStore } from "../providers/DealStoreProvider.tsx";

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
