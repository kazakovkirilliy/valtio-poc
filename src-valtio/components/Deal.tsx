import "./columns.css";
import "./Deal.css";
import { memo } from "react";
import { columnsGridTemplateRows } from "../stores/fields.ts";
import { LabelColumn } from "./LabelColumn.tsx";
import { GroupColumn } from "./GroupColumn.tsx";
import { useOnMount } from "../hooks/useOnMount.ts";
import { useProxyArray } from "../hooks/useProxyValue.ts";
import { DealColumn } from "./DealColumn.tsx";
import { DealHeader } from "./DealHeader.tsx";
import { useDealStore } from "./DealStoreProvider.tsx";

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
