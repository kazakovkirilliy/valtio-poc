import { observer } from "mobx-react-lite";
import { FieldCells } from "../fields/FieldCells.tsx";
import type { OptionProduct } from "./optionProduct.ts";

type Props = {
  product: OptionProduct;
};

/** A product's title and fields; clone/remove live on the group. */
export const ProductColumn = observer(({ product }: Props) => (
  <div className="column">
    <div className="column__header">
      <h5 className="column__title">{product.ui.title}</h5>
    </div>
    <FieldCells fields={product.fields} />
  </div>
));

ProductColumn.displayName = "ProductColumn";
