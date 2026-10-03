import { observer } from "mobx-react-lite";
import { Input } from "@shared/components/Input.tsx";
import { Select } from "@shared/components/Select.tsx";
import {
  type FieldId,
  type SelectFieldId,
  fieldInputTypes,
  fieldLabels,
  existsForParam,
  fieldOptions,
  isAsyncOptions,
} from "@shared/fields.ts";
import { optionsKey } from "@shared/options/optionsSource.ts";
import type { FieldModel } from "../../stores/fieldModel.ts";
import { optionsStore } from "../../stores/optionsStore.ts";

type Props = {
  fieldId: FieldId;
  field: FieldModel;
  /** Async options: the column's model of the field they depend on; without it, the default. */
  paramField?: FieldModel;
};

/** A dropdown: a fixed list, or the options loaded for its parameter. */
const ModelSelect = observer(
  ({ fieldId, field, paramField }: Props & { fieldId: SelectFieldId }) => {
    const options = fieldOptions[fieldId];
    const props = {
      label: fieldLabels[fieldId],
      value: field.value,
      hasError: field.issues.length > 0,
      onCommit: (value: unknown) => field.commit(value),
    };
    if (!isAsyncOptions(options)) {
      return <Select {...props} options={options} status="loaded" />;
    }
    const param = (paramField?.value as string | undefined) || options.defaultParam;
    // the product doesn't have the field for this parameter: nothing to show
    if (!existsForParam(options, param)) return null;
    const loaded = optionsStore.byKey[optionsKey(options.source, param)];
    return <Select {...props} options={loaded?.options ?? []} status={loaded?.status ?? "loading"} />;
  },
);

ModelSelect.displayName = "ModelSelect";

/** Any field, from its model: an input, or a dropdown over its options. */
export const ModelField = observer(({ fieldId, field, paramField }: Props) => {
  const type = fieldInputTypes[fieldId];
  if (type === "select") {
    return <ModelSelect fieldId={fieldId as SelectFieldId} field={field} paramField={paramField} />;
  }
  return (
    <Input
      label={fieldLabels[fieldId]}
      type={type}
      value={field.value}
      hasError={field.issues.length > 0}
      readOnly={field.readOnly}
      onCommit={(value) => field.commit(value)}
    />
  );
});

ModelField.displayName = "ModelField";
