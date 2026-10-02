import "@shared/styles/group.css";
import { memo } from "react";
import { useStoreMap } from "effector-react";
import { useAction } from "../../hooks/units.ts";
import { sameKeys } from "../../stores/keys.ts";
import { useDealStore } from "../providers/DealStoreProvider.tsx";
import { ProductColumn } from "./ProductColumn.tsx";

/**
 * Re-renders only when this group's title or index changes. The group
 * object itself is replaced on every edit to one of its products, so the
 * column selects only its `ui` and its product ids, never the whole group.
 */
export const GroupColumn = memo(({ groupId }: { groupId: string }) => {
  const deal = useDealStore();
  const ui = useStoreMap({
    store: deal.$groups,
    keys: [groupId],
    fn: (groups, [id]) => groups[id]?.ui ?? null,
  });
  const productIds = useStoreMap({
    store: deal.$groups,
    keys: [groupId],
    fn: (groups, [id]) => (groups[id] ? Object.keys(groups[id].products) : []),
    updateFilter: (next, current) => !sameKeys(next, current),
  });
  const cloneGroup = useAction(deal.actions.cloneGroupAction);
  const removeGroup = useAction(deal.actions.removeGroupAction);

  // the group may be gone for one render after removal
  if (!ui) return null;

  return (
    // product columns are direct children, so they share the deal's rows
    <div
      className="group"
      style={{ gridTemplateColumns: `repeat(${productIds.length}, auto)` }}
    >
      <div className="column__header group__header">
        <h5 className="column__title">{ui.title}</h5>
        <button className="button" onClick={() => cloneGroup(groupId)}>
          Clone
        </button>
        <button className="button" onClick={() => removeGroup(groupId)}>
          Remove
        </button>
      </div>
      {productIds.map((productId) => (
        <ProductColumn key={productId} groupId={groupId} productId={productId} />
      ))}
    </div>
  );
});

GroupColumn.displayName = "GroupColumn";
