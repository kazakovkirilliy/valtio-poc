import { memo, useMemo } from "react";
import { FieldCells, type FieldBindings } from "../fields/FieldCells.tsx";
import type { ProductFieldId } from "../fields/fields.ts";
import { ProductColumnHeader } from "./ProductColumnHeader.tsx";
import {
  type CommonKey,
  optionProductFieldPaths,
} from "./optionProductFields.ts";

type Props = {
  productPath: string; // the product's path from the deal
};

/** Shared column of the option products; they differ only in `commonKey`. */
const OptionProductColumn = memo(
  ({ productPath, commonKey }: Props & { commonKey: CommonKey }) => {
    // every product field, bound at the same path the store uses
    const bindings = useMemo(() => {
      const paths = optionProductFieldPaths(commonKey);
      const result: FieldBindings = {};
      for (const fieldId of Object.keys(paths) as ProductFieldId[]) {
        result[fieldId] = {
          path: `${productPath}.${paths[fieldId]}`,
          readOnly: fieldId === "expiryDays", // derived from expiryDate
        };
      }
      return result;
    }, [productPath, commonKey]);

    return (
      <div className="column">
        <ProductColumnHeader productPath={productPath} />
        <FieldCells bindings={bindings} />
      </div>
    );
  },
);

OptionProductColumn.displayName = "OptionProductColumn";

export const VanillaProductColumn = memo(({ productPath }: Props) => (
  <OptionProductColumn productPath={productPath} commonKey="optionsCommon" />
));

VanillaProductColumn.displayName = "VanillaProductColumn";

export const AverageProductColumn = memo(({ productPath }: Props) => (
  <OptionProductColumn productPath={productPath} commonKey="avroCommon" />
));

AverageProductColumn.displayName = "AverageProductColumn";
