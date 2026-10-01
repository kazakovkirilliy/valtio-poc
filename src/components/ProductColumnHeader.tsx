import { memo, useCallback } from "react";
import { useDealStore } from "../contexts/DealStoreProvider.tsx";
import { useDealValue } from "../hooks/useDealValue.ts";

type Props = {
  productId: string;
};

/** Title plus clone/remove actions, shared by every product column. */
export const ProductColumnHeader = memo(({ productId }: Props) => {
  const { actions } = useDealStore();
  // subscribed on the product's `ui` object, which field edits never touch
  const title = useDealValue(`products.${productId}.ui.title`) as string;

  const handleClone = useCallback(
    () => actions.cloneProduct(productId),
    [actions, productId],
  );
  const handleRemove = useCallback(
    () => actions.removeProduct(productId),
    [actions, productId],
  );

  return (
    <div className="column__header">
      <h5>{title}</h5>
      <button className="button" onClick={handleClone}>
        Clone
      </button>
      <button className="button" onClick={handleRemove}>
        Remove
      </button>
    </div>
  );
});

ProductColumnHeader.displayName = "ProductColumnHeader";
