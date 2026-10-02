import "@shared/styles/columns.css";
import "@shared/styles/deal.css";
import { memo } from "react";
import { columnsGridTemplateRows } from "@shared/fields.ts";
import { LabelColumn } from "@shared/components/LabelColumn.tsx";
import { GroupColumn } from "../columns/GroupColumn.tsx";
import { useOnMount } from "@shared/hooks/useOnMount.ts";
import { useProxyArray } from "../../hooks/useProxyValue.ts";
import { DealColumn } from "../columns/DealColumn.tsx";
import { DealHeader } from "./DealHeader.tsx";
import { useDealStore } from "../providers/DealStoreProvider.tsx";

export const Deal = memo(() => {
  const dealStore = useDealStore();
  // re-renders only when groups are added, cloned, removed or reordered
  const groupIds = useProxyArray(dealStore.groupIds);

  useOnMount(() => {
    dealStore.actions.addNewGroup("VanillaGroup");
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
