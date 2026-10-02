import { memo, useMemo } from "react";
import { useDealValue } from "../hooks/useDealValue.ts";
import type { ProductFieldId } from "../stores/fields.ts";
import {
  type ProductType,
  productDefinitions,
} from "../stores/products/productRegistry.ts";
import { FieldCells, type FieldBindings } from "./FieldCells.tsx";

type Props = {
  productPath: string; // the product's path from the deal
  productType: ProductType;
};

/**
 * Any product's column: its title and every field it maps. Which fields a
 * product has, and where they live, comes from its own store module.
 */
export const ProductColumn = memo(({ productPath, productType }: Props) => {
  // subscribed on the product's `ui` object, which field edits never touch
  const title = useDealValue(`${productPath}.ui.title`) as string;

  const bindings = useMemo(() => {
    const { fieldPaths, readOnlyFields } = productDefinitions[productType];
    const result: FieldBindings = {};
    for (const [fieldId, path] of Object.entries(fieldPaths) as [
      ProductFieldId,
      string,
    ][]) {
      result[fieldId] = {
        path: `${productPath}.${path}`,
        readOnly: readOnlyFields.includes(fieldId),
      };
    }
    return result;
  }, [productPath, productType]);

  return (
    <div className="column">
      <div className="column__header">
        <h5 className="column__title">{title}</h5>
      </div>
      <FieldCells bindings={bindings} />
    </div>
  );
});

ProductColumn.displayName = "ProductColumn";
