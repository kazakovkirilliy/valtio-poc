import { DealColumn } from "./DealColumn.tsx";
import { GroupColumn } from "./GroupColumn.tsx";
import { LabelColumn } from "./LabelColumn.tsx";
import { gridTemplateRows } from "./fieldRows.ts";
import { useDealStore } from "../contexts/DealStoreProvider.tsx";
import { DealHeader } from "./DealHeader.tsx";
import { memo } from "react";
import { useOnMount } from "../hooks/useOnMount.ts";
import { useProxyArray } from "../hooks/useProxyValue.ts";

export const Deal = memo(() => {
  const dealStore = useDealStore();
  // re-renders only when groups are added, cloned, removed or reordered
  const groupIds = useProxyArray(dealStore.groupIds);

  useOnMount(() => {
    dealStore.actions.addNewGroup("VanillaGroup");
  });

  return (
    <>
      <section className="deal">
        <DealHeader />

        <div className="columnsContainer" style={{ gridTemplateRows }}>
          <DealColumn />
          <LabelColumn />
          {groupIds.map((groupId) => (
            <GroupColumn key={groupId} groupId={groupId} />
          ))}
        </div>
      </section>
    </>
  );
});

Deal.displayName = "Deal";
