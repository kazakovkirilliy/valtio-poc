import "./GroupColumn.css";
import { observer } from "mobx-react-lite";
import { useDealStore } from "./DealStoreProvider.tsx";
import { ProductColumn } from "./ProductColumn.tsx";
import type { GroupStore } from "../stores/groupStore.ts";

type Props = {
  group: GroupStore;
};

export const GroupColumn = observer(({ group }: Props) => {
  const deal = useDealStore();

  return (
    // product columns are direct children, so they share the deal's rows
    <div
      className="group"
      style={{ gridTemplateColumns: `repeat(${group.productIds.length}, auto)` }}
    >
      <div className="column__header group__header">
        <h5 className="column__title">{group.ui.title}</h5>
        <button className="button" onClick={() => deal.cloneGroup(group.id)}>
          Clone
        </button>
        <button className="button" onClick={() => deal.removeGroup(group.id)}>
          Remove
        </button>
      </div>
      {group.productList.map((product) => (
        <ProductColumn key={product.id} product={product} />
      ))}
    </div>
  );
});

GroupColumn.displayName = "GroupColumn";
