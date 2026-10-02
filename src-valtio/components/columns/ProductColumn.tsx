import { memo, useMemo } from "react";
import { FieldCells } from "@shared/components/FieldCells.tsx";
import { type ProductFieldId, asyncOptionFields } from "@shared/fields.ts";
import {
  type ProductType,
  definitionOf,
  isReadOnly,
} from "@shared/products/productRegistry.ts";
import { useDealValue } from "../../hooks/useDealValue.ts";
import { BoundField } from "../fields/BoundField.tsx";

type Props = {
  productPath: string; // the product's path from the deal
  productType: ProductType;
};

/**
 * Any product's column: its title and every field it maps. Which fields a
 * product has, and where they live, comes from its declaration.
 */
export const ProductColumn = memo(({ productPath, productType }: Props) => {
  // subscribed on the product's `ui` object, which field edits never touch
  const title = useDealValue(`${productPath}.ui.title`) as string;

  const fields = useMemo(() => {
    const definition = definitionOf(productType);
    const pathOf = (fieldId: ProductFieldId) =>
      `${productPath}.data.${definition.fieldPaths[fieldId]}`;
    // async options read this product's value of the field they depend on
    const paramPaths = Object.fromEntries(
      asyncOptionFields.map(({ fieldId, options }) => [fieldId, pathOf(options.dependsOn)]),
    );
    return Object.fromEntries(
      (Object.keys(definition.fieldPaths) as ProductFieldId[]).map((fieldId) => [
        fieldId,
        <BoundField
          fieldId={fieldId}
          path={pathOf(fieldId)}
          readOnly={isReadOnly(definition, fieldId)}
          paramPath={paramPaths[fieldId]}
        />,
      ]),
    );
  }, [productPath, productType]);

  return (
    <div className="column">
      <div className="column__header">
        <h5 className="column__title">{title}</h5>
      </div>
      <FieldCells fields={fields} />
    </div>
  );
});

ProductColumn.displayName = "ProductColumn";
