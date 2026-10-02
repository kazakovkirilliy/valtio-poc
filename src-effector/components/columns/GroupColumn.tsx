import "./GroupColumn.css";
import { memo } from "react";
import { useStoreMap } from "effector-react";
import { useAction } from "../../hooks/units.ts";
import { useDealStore } from "../providers/DealStoreProvider.tsx";
import { ProductColumn } from "./ProductColumn.tsx";

/** Re-renders only when this group's own state changes (e.g. its title). */
export const GroupColumn = memo(({ groupId }: { groupId: string }) => {
  const deal = useDealStore();
  const group = useStoreMap({
    store: deal.$groups,
    keys: [groupId],
    fn: (groups, [id]) => groups.byId[id] ?? null,
  });
  const cloneGroup = useAction(deal.actions.cloneGroupAction);
  const removeGroup = useAction(deal.actions.removeGroupAction);

  // the group may be gone for one render after removal
  if (!group) return null;

  return (
    // product columns are direct children, so they share the deal's rows
    <div
      className="group"
      style={{ gridTemplateColumns: `repeat(${group.productIds.length}, auto)` }}
    >
      <div className="column__header group__header">
        <h5 className="column__title">{group.ui.title}</h5>
        <button className="button" onClick={() => cloneGroup(groupId)}>
          Clone
        </button>
        <button className="button" onClick={() => removeGroup(groupId)}>
          Remove
        </button>
      </div>
      {group.productIds.map((productId) => (
        <ProductColumn key={productId} productId={productId} />
      ))}
    </div>
  );
});

GroupColumn.displayName = "GroupColumn";
