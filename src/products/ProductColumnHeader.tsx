import { memo } from "react";
import { useDealValue } from "../deal/useDealValue.ts";

type Props = {
  productPath: string; // the product's path from the deal
};

/** Product title; clone/remove live on the group. */
export const ProductColumnHeader = memo(({ productPath }: Props) => {
  // subscribed on the product's `ui` object, which field edits never touch
  const title = useDealValue(`${productPath}.ui.title`) as string;

  return (
    <div className="column__header">
      <h5 className="column__title">{title}</h5>
    </div>
  );
});

ProductColumnHeader.displayName = "ProductColumnHeader";
