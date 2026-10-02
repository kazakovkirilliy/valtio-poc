import "./GroupColumn.css";
import { memo, useCallback } from "react";
import { useDealStore } from "../providers/DealStoreProvider.tsx";
import { useDealValue } from "../../hooks/useDealValue.ts";
import { getProductType } from "../../stores/products/productRegistry.ts";
import { ProductColumn } from "./ProductColumn.tsx";

type Props = {
  groupId: string;
};

export const GroupColumn = memo(({ groupId }: Props) => {
  const { groups, actions } = useDealStore();
  // subscribed on the group's `ui` object, which field edits never touch
  const title = useDealValue(`groups.${groupId}.ui.title`) as string;
  // a group's products are fixed at creation, so they are read without a
  // subscription; the group may be gone for one render after removal
  const group = groups[groupId] as (typeof groups)[string] | undefined;

  const handleClone = useCallback(
    () => actions.cloneGroup(groupId),
    [actions, groupId],
  );
  const handleRemove = useCallback(
    () => actions.removeGroup(groupId),
    [actions, groupId],
  );

  return (
    // product columns are direct children, so they share the deal's rows
    <div
      className="group"
      style={{
        gridTemplateColumns: `repeat(${group?.productIds.length ?? 1}, auto)`,
      }}
    >
      <div className="column__header group__header">
        <h5 className="column__title">{title}</h5>
        <button className="button" onClick={handleClone}>
          Clone
        </button>
        <button className="button" onClick={handleRemove}>
          Remove
        </button>
      </div>
      {group?.productIds.map((productId) => (
        <ProductColumn
          key={productId}
          productPath={`groups.${groupId}.products.${productId}`}
          productType={getProductType(group.products[productId])}
        />
      ))}
    </div>
  );
});

GroupColumn.displayName = "GroupColumn";
