import { memo } from "react";
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
import {
  useDealCommit,
  useDealValue,
  useValidationError,
} from "../../hooks/useDealValue.ts";
import { useProxyValue } from "../../hooks/useProxyValue.ts";
import { optionsStore } from "../../stores/optionsStore.ts";

type Props = {
  fieldId: FieldId;
  /** The field's path from the deal. */
  path: string;
  /** Deal column: holds nothing (shows empty); a commit pushes into every product. */
  isBroadcasting?: boolean;
  readOnly?: boolean;
  /** Async options: the path of the field they depend on; without it, the default. */
  paramPath?: string;
};

type ControlProps = {
  label: string;
  value: unknown;
  hasError: boolean;
  onCommit: (value: unknown) => void;
};

/** A dropdown: a fixed list, or the options loaded for its parameter. */
const BoundSelect = memo(
  ({ fieldId, paramPath, ...props }: ControlProps & { fieldId: SelectFieldId; paramPath?: string }) => {
    const options = fieldOptions[fieldId];
    const param =
      (useDealValue(paramPath ?? "") as string | undefined) ||
      (isAsyncOptions(options) ? options.defaultParam : "");
    const loaded = useProxyValue(
      optionsStore.byKey,
      isAsyncOptions(options) ? optionsKey(options.source, param) : "",
    );

    return isAsyncOptions(options) ? (
      <Select {...props} options={loaded?.options ?? []} status={loaded?.status ?? "loading"} />
    ) : (
      <Select {...props} options={options} status="loaded" />
    );
  },
);

BoundSelect.displayName = "BoundSelect";

/** Any field, bound to a deal path: an input, or a dropdown over its options. */
export const BoundField = memo(
  ({ fieldId, path, isBroadcasting = false, readOnly = false, paramPath }: Props) => {
    const value = useDealValue(path);
    const { hasError } = useValidationError(path);
    const commit = useDealCommit(path, isBroadcasting);
    const props: ControlProps = {
      label: fieldLabels[fieldId],
      value: isBroadcasting ? undefined : value,
      hasError,
      onCommit: commit,
    };
    const type = fieldInputTypes[fieldId];

    return type === "select" ? (
      <BoundSelect {...props} fieldId={fieldId as SelectFieldId} paramPath={paramPath} />
    ) : (
      <Input {...props} type={type} readOnly={readOnly} />
    );
  },
);

BoundField.displayName = "BoundField";
