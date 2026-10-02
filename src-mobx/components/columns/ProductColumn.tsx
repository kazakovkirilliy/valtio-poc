import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { FieldCells } from "@shared/components/FieldCells.tsx";
import { type ProductFieldId, asyncOptionFields } from "@shared/fields.ts";
import type { Product } from "../../stores/productStore.ts";
import { ModelField } from "../fields/ModelField.tsx";

type Props = {
  product: Product;
};

/**
 * Any product's title and fields; clone/remove live on the group. Which
 * fields a product has comes from its declaration (`product.fields`).
 */
export const ProductColumn = observer(({ product }: Props) => {
  const fields = useMemo(() => {
    // async options read this product's model of the field they depend on
    const paramFields = Object.fromEntries(
      asyncOptionFields.map(({ fieldId, options }) => [fieldId, product.fields[options.dependsOn]]),
    );
    return Object.fromEntries(
      (Object.keys(product.fields) as ProductFieldId[]).map((fieldId) => [
        fieldId,
        <ModelField fieldId={fieldId} field={product.fields[fieldId]} paramField={paramFields[fieldId]} />,
      ]),
    );
  }, [product]);

  return (
    <div className="column">
      <div className="column__header">
        <h5 className="column__title">{product.ui.title}</h5>
      </div>
      <FieldCells fields={fields} />
    </div>
  );
});

ProductColumn.displayName = "ProductColumn";
