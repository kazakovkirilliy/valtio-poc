import { memo } from "react";
import { useStoreMap } from "effector-react";
import { Input } from "@shared/components/Input.tsx";
import { Select } from "@shared/components/Select.tsx";
import {
  type FieldId,
  type SelectFieldId,
  fieldInputTypes,
  fieldLabels,
  fieldOptions,
  isAsyncOptions,
} from "@shared/fields.ts";
import { optionsKey } from "@shared/options/optionsSource.ts";
import { $optionsByKey } from "../../stores/optionsStore.ts";

type Props = {
  fieldId: FieldId;
  value: unknown;
  hasError?: boolean;
  readOnly?: boolean;
  /** Async options: the value of the field they depend on; without it, the default. */
  param?: string;
  onCommit: (value: unknown) => void;
};

/** A dropdown: a fixed list, or the options loaded for its parameter. */
const FieldSelect = memo(({ fieldId, param, readOnly: _, ...props }: Props & { fieldId: SelectFieldId }) => {
  const options = fieldOptions[fieldId];
  const key = isAsyncOptions(options)
    ? optionsKey(options.source, param || options.defaultParam)
    : "";
  const loaded = useStoreMap({
    store: $optionsByKey,
    keys: [key],
    fn: (byKey, [k]) => byKey[k] ?? null,
  });
  const label = fieldLabels[fieldId];

  return isAsyncOptions(options) ? (
    <Select {...props} label={label} options={loaded?.options ?? []} status={loaded?.status ?? "loading"} />
  ) : (
    <Select {...props} label={label} options={options} status="loaded" />
  );
});

FieldSelect.displayName = "FieldSelect";

/** Any field: an input, or a dropdown over its options. */
export const Field = memo((props: Props) => {
  const type = fieldInputTypes[props.fieldId];
  if (type === "select") {
    return <FieldSelect {...props} fieldId={props.fieldId as SelectFieldId} />;
  }
  const { fieldId, param: _, ...rest } = props;
  return <Input {...rest} label={fieldLabels[fieldId]} type={type} />;
});

Field.displayName = "Field";
