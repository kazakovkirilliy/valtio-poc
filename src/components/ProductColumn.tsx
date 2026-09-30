import { memo } from "react";
import type { EditorRow, Workspace } from "../state/workspace.ts";
import { TextInput } from "./TextInput.tsx";

type Props = { product: EditorRow; workspace: Workspace; index: number };

export const ProductColumn = memo(function ProductColumn({ product, workspace, index }: Props) {
  return (
    <section className="column product-column" aria-label={`Product ${index + 1}`}>
      <h3>Product Column <span>{index + 1}</span></h3>
      <TextInput field={workspace.baseCode} label="Notional Ccy" />
      <TextInput field={workspace.quoteCode} label="Premium Ccy" />
      <TextInput field={product.level} label="Strike" />
      <button
        className="button quiet remove-product"
        aria-label={`Remove product ${index + 1}`}
        onClick={() => workspace.actions.removeRow(product)}
      >
        Remove Product
      </button>
    </section>
  );
});
