import { memo, useMemo } from "react";
import { useStoreMap } from "effector-react";
import { FieldCells } from "@shared/components/FieldCells.tsx";
import { type ProductFieldId, asyncOptionFields } from "@shared/fields.ts";
import {
  type ProductType,
  definitionOf,
  isReadOnly,
} from "@shared/products/productRegistry.ts";
import { useAction } from "../../hooks/units.ts";
import { productOf } from "../../stores/groupStore.ts";
import { readProductField } from "../../stores/productStore.ts";
import { Field } from "../fields/Field.tsx";
import { useDealStore } from "../providers/DealStoreProvider.tsx";

/** Async option fields, and the field their options depend on. */
const paramFieldOf = Object.fromEntries(
  asyncOptionFields.map(({ fieldId, options }) => [fieldId, options.dependsOn]),
) as Partial<Record<ProductFieldId, ProductFieldId>>;

type ProductProps = {
  groupId: string;
  productId: string;
};

type FieldProps = ProductProps & {
  fieldId: ProductFieldId;
  readOnly: boolean;
};

/**
 * One product field. It selects only its own value, whether it has issues
 * and (async options) the value they depend on, so it re-renders only when
 * one of those changes.
 */
const ProductField = memo(({ groupId, productId, fieldId, readOnly }: FieldProps) => {
  const { $groups, $validation, actions } = useDealStore();
  const value = useStoreMap({
    store: $groups,
    keys: [groupId, productId, fieldId],
    fn: (groups, [group, id, field]) => {
      const product = productOf(groups, group, id);
      return product ? (readProductField(product, field) ?? null) : null;
    },
  });
  const param = useStoreMap({
    store: $groups,
    keys: [groupId, productId, paramFieldOf[fieldId] ?? null],
    fn: (groups, [group, id, paramField]) => {
      const product = productOf(groups, group, id);
      return product && paramField ? String(readProductField(product, paramField) ?? "") : "";
    },
  });
  const hasError = useStoreMap({
    store: $validation,
    keys: [productId, fieldId],
    fn: (validation, [id, field]) => (validation[id]?.[field]?.length ?? 0) > 0,
  });
  const commit = useAction(actions.commitProductFieldAction);

  return (
    <Field
      fieldId={fieldId}
      value={value}
      hasError={hasError}
      readOnly={readOnly}
      param={param}
      onCommit={(next) => commit({ groupId, productId, fieldId, value: next })}
    />
  );
});

ProductField.displayName = "ProductField";

/**
 * Any product's column: its title and every field it maps. Which fields a
 * product has comes from its declaration.
 */
export const ProductColumn = memo(({ groupId, productId }: ProductProps) => {
  const { $groups } = useDealStore();
  const title = useStoreMap({
    store: $groups,
    keys: [groupId, productId],
    fn: (groups, [group, id]) => productOf(groups, group, id)?.ui.title ?? "",
  });
  const productType = useStoreMap({
    store: $groups,
    keys: [groupId, productId],
    fn: (groups, [group, id]): ProductType | null =>
      productOf(groups, group, id)?.data.productType ?? null,
  });

  const fields = useMemo(() => {
    if (!productType) return {};
    const definition = definitionOf(productType);
    return Object.fromEntries(
      (Object.keys(definition.fieldPaths) as ProductFieldId[]).map((fieldId) => [
        fieldId,
        <ProductField
          groupId={groupId}
          productId={productId}
          fieldId={fieldId}
          readOnly={isReadOnly(definition, fieldId)}
        />,
      ]),
    );
  }, [groupId, productId, productType]);

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
