import { useState } from "react";
import { observer } from "mobx-react-lite";
import clsx from "clsx";
import type { InputType } from "../../stores/fields.ts";
import type { FieldModel } from "../../stores/fieldModel.ts";

type Props = {
  field: FieldModel;
  /** Accessible name only; the visible labels live in the label column. */
  label: string;
  /**
   * - `text`: commits the string as typed.
   * - `number`: commits a number (`NaN` when empty, so validation can flag it).
   * - `date`: commits an ISO `YYYY-MM-DD` string (`""` when cleared).
   */
  type?: InputType;
};

const toDisplayValue = (value: unknown) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "number" && Number.isNaN(value)) return "";
  return String(value);
};

const parse = (draft: string, type: InputType) =>
  type === "number" ? (draft === "" ? NaN : Number(draft)) : draft;

/**
 * Every field commits on blur or Enter, never per keystroke: the text is
 * held in a local draft while editing. What a commit does — write the
 * product, sync the deal, broadcast — is up to the field model.
 */
export const Input = observer(({ field, label, type = "text" }: Props) => {
  // `null` while not editing: the field shows the model value
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    field.commit(parse(draft, type));
  };

  return (
    <input
      className={clsx("input", { "input--error": field.issues.length > 0 })}
      type={type}
      aria-label={label}
      readOnly={field.readOnly}
      value={draft ?? toDisplayValue(field.value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
});

Input.displayName = "Input";
