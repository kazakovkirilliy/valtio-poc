import { memo } from "react";
import { useDealId, useStoreBindings } from "../StoreProvider.tsx";
import { fields } from "../fields.ts";
import { productFieldPath, type ProductSummary } from "../domain.ts";
import { Input } from "./Input.tsx";

const ProductColumn = memo(({ groupId, product }: { groupId: string; product: ProductSummary }) => (
  <div className="column" aria-label={product.title} data-product-id={product.id} data-product-type={product.productType}>
    <div className="column__header"><h2 className="column__title">{product.title}</h2></div>
    {fields.map(({ id, label, input }) => (
      <div className="cell" key={id}>
        {id === "spotStream" ? null : (
          <Input label={label} type={input} readOnly={id === "expiryDays"}
            target={{ scope: "product", groupId, productId: product.id, field: id }}
            path={`groups.${groupId}.products.${product.id}.data.${productFieldPath(product.productType, id)}`} />
        )}
      </div>
    ))}
  </div>
));
ProductColumn.displayName = "ProductColumn";

export const GroupColumn = memo(({ groupId }: { groupId: string }) => {
  const bindings = useStoreBindings();
  const dealId = useDealId();
  const group = bindings.useGroup(dealId, groupId);
  const actions = bindings.getDealActions(dealId);
  if (!group) return null;
  return (
    <div className="group" aria-label={group.title} data-group-id={group.id}
      style={{ gridTemplateColumns: `repeat(${group.products.length}, auto)` }}>
      <div className="column__header group__header">
        <h2 className="column__title">{group.title}</h2>
        <button className="button" aria-label={`Clone ${group.title}`} onClick={() => actions.cloneGroup(groupId)}>Clone</button>
        <button className="button" aria-label={`Remove ${group.title}`} onClick={() => actions.removeGroup(groupId)}>Remove</button>
      </div>
      {group.products.map((product) => <ProductColumn key={product.id} groupId={group.id} product={product} />)}
    </div>
  );
});
GroupColumn.displayName = "GroupColumn";
