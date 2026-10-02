import { memo, useMemo } from "react";
import { useStoreMap } from "effector-react";
import { useAction } from "../../hooks/units.ts";
import {
  type ProductFieldId,
  fieldInputTypes,
  fieldLabels,
} from "../../stores/fields.ts";
import {
  type ProductType,
  productDefinitions,
  readProductField,
} from "../../stores/products/productRegistry.ts";
import { useDealStore } from "../providers/DealStoreProvider.tsx";
import { FieldCells } from "./FieldCells.tsx";
import { Input } from "../fields/Input.tsx";
import { FixingSourceSelect } from "../fields/FixingSourceSelect.tsx";
import { SettlementStyleSelect } from "../fields/SettlementStyleSelect.tsx";
import { DEFAULT_SETTLEMENT_STYLE } from "../../stores/settlementStyles.ts";

type FieldProps = {
  productId: string;
  fieldId: ProductFieldId;
  readOnly: boolean;
};

/**
 * One product field. It selects only its own value and whether it has
 * issues, so it re-renders only when one of those two changes.
 */
const ProductField = memo(({ productId, fieldId, readOnly }: FieldProps) => {
  const { $products, $validation, actions } = useDealStore();
  const value = useStoreMap({
    store: $products,
    keys: [productId, fieldId],
    fn: (products, [id, field]) => {
      const product = products[id];
      return product ? (readProductField(product, field) ?? null) : null;
    },
  });
  const hasError = useStoreMap({
    store: $validation,
    keys: [productId, fieldId],
    fn: (validation, [id, field]) => (validation[id]?.[field]?.length ?? 0) > 0,
  });
  const commit = useAction(actions.commitProductFieldAction);
  const onCommit = (next: unknown) => commit({ productId, fieldId, value: next });
  const type = fieldInputTypes[fieldId];

  return type === "select" ? (
    fieldId === "settlementStyle" ? (
      <SettlementStyleSelect
        label={fieldLabels[fieldId]}
        value={value}
        hasError={hasError}
        onCommit={onCommit}
      />
    ) : (
      <ProductFixingSourceSelect
        productId={productId}
        label={fieldLabels[fieldId]}
        value={value}
        hasError={hasError}
        onCommit={onCommit}
      />
    )
  ) : (
    <Input
      label={fieldLabels[fieldId]}
      type={type}
      value={value}
      hasError={hasError}
      readOnly={readOnly}
      onCommit={onCommit}
    />
  );
});

ProductField.displayName = "ProductField";

type FixingSourceProps = {
  productId: string;
  label: string;
  value: unknown;
  hasError: boolean;
  onCommit: (value: unknown) => void;
};

/** Fixing Source: shows the options loaded for this product's settlement style. */
const ProductFixingSourceSelect = memo(
  ({ productId, ...props }: FixingSourceProps) => {
    const { $products } = useDealStore();
    const settlementStyle = useStoreMap({
      store: $products,
      keys: [productId],
      fn: (products, [id]) => {
        const product = products[id];
        return product ? String(readProductField(product, "settlementStyle") ?? "") : "";
      },
    });

    return (
      <FixingSourceSelect
        {...props}
        settlementStyle={settlementStyle || DEFAULT_SETTLEMENT_STYLE}
      />
    );
  },
);

ProductFixingSourceSelect.displayName = "ProductFixingSourceSelect";

/**
 * Any product's column: its title and every field it maps. Which fields a
 * product has, and where they live, comes from its own module.
 */
export const ProductColumn = memo(({ productId }: { productId: string }) => {
  const { $products } = useDealStore();
  const title = useStoreMap({
    store: $products,
    keys: [productId],
    fn: (products, [id]) => products[id]?.ui.title ?? "",
  });
  const productType = useStoreMap({
    store: $products,
    keys: [productId],
    fn: (products, [id]): ProductType | null =>
      products[id]?.data.productType ?? null,
  });

  const fields = useMemo(() => {
    if (!productType) return {};
    const { fieldPaths, readOnlyFields } = productDefinitions[productType];
    return Object.fromEntries(
      (Object.keys(fieldPaths) as ProductFieldId[]).map((fieldId) => [
        fieldId,
        <ProductField
          productId={productId}
          fieldId={fieldId}
          readOnly={readOnlyFields.includes(fieldId)}
        />,
      ]),
    );
  }, [productId, productType]);

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
