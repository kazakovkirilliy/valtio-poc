import { observer } from "mobx-react-lite";
import { FieldCells } from "./FieldCells.tsx";
import type { AnyProduct } from "../../stores/products/productRegistry.ts";

type Props = {
  product: AnyProduct;
};

/**
 * Any product's title and fields; clone/remove live on the group. Which
 * fields a product has comes from its own store module (`product.fields`).
 */
export const ProductColumn = observer(({ product }: Props) => (
  <div className="column">
    <div className="column__header">
      <h5 className="column__title">{product.ui.title}</h5>
    </div>
    <FieldCells fields={product.fields} />
  </div>
));

ProductColumn.displayName = "ProductColumn";
