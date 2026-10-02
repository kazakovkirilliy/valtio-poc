import { memo, useState } from "react";
import clsx from "clsx";
import type { InputType } from "../../stores/fields.ts";

type Props = {
  /** Accessible name only; the visible labels live in the label column. */
  label: string;
  /**
   * - `text`: commits the string as typed.
   * - `number`: commits a number (`NaN` when empty, so validation can flag it).
   * - `date`: commits an ISO `YYYY-MM-DD` string (`""` when cleared).
   */
  type?: InputType;
  value: unknown;
  hasError?: boolean;
  readOnly?: boolean;
  onCommit: (value: unknown) => void;
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
 * held in a local draft while editing. What a commit does is up to the
 * component that connects the input to the deal.
 */
export const Input = memo(
  ({
    label,
    type = "text",
    value,
    hasError = false,
    readOnly = false,
    onCommit,
  }: Props) => {
    // `null` while not editing: the field shows `value`
    const [draft, setDraft] = useState<string | null>(null);

    const commit = () => {
      if (draft === null) return;
      setDraft(null);
      onCommit(parse(draft, type));
    };

    return (
      <input
        className={clsx("input", { "input--error": hasError })}
        type={type}
        aria-label={label}
        readOnly={readOnly}
        value={draft ?? toDisplayValue(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    );
  },
);

Input.displayName = "Input";
