import {
  memo,
  useCallback,
  useState,
  type DetailedHTMLProps,
  type InputHTMLAttributes,
} from "react";
import { useDealStore } from "../contexts/DealStoreProvider.tsx";
import clsx from "clsx";
import { useDealValue, useValidationError } from "../hooks/useDealValue.ts";

type Props = {
  path: string;
  /** Accessible name only; the visible labels live in the label column. */
  label: string;
  /**
   * - `text`: stores the string as typed.
   * - `number`: stores a number (`NaN` when the field is empty, so
   *   validation can flag it).
   * - `date`: stores an ISO `YYYY-MM-DD` string (`""` when cleared).
   */
  type?: "text" | "number" | "date";
  /**
   * Broadcast field: on commit the value is written to the store, where it
   * propagates to the subscribers, and is then dropped — the field is never
   * kept here and shows empty again.
   */
  isBroadcasting?: boolean;

  inputProps?: DetailedHTMLProps<
    InputHTMLAttributes<HTMLInputElement>,
    HTMLInputElement
  >;
};

const toDisplayValue = (value: unknown) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "number" && Number.isNaN(value)) return "";
  return String(value);
};

/**
 * Every field commits on blur or Enter, never per keystroke: the text is
 * held in a local draft while editing, so syncs, broadcasts and validation
 * run once per edit instead of once per character.
 */
export const Input = memo(
  ({
    path,
    label,
    type = "text",
    isBroadcasting = false,
    inputProps = {},
  }: Props) => {
    const actions = useDealStore().actions;
    const value = useDealValue(path);
    const { hasError } = useValidationError(path);

    // `null` while not editing: the field shows the store value
    const [draft, setDraft] = useState<string | null>(null);

    const handleOnChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
      [],
    );

    const handleCommit = useCallback(() => {
      if (draft === null) return;
      setDraft(null);

      if (isBroadcasting) {
        if (!draft) return; // nothing to broadcast
        actions.setValueByPath(path, type === "number" ? Number(draft) : draft);
        actions.setValueByPath(path, undefined);
        return;
      }

      // an empty number input is NaN, not Number("") === 0
      const committed =
        type === "number" ? (draft === "" ? NaN : Number(draft)) : draft;
      actions.setValueByPath(path, committed);
    }, [actions, draft, path, type, isBroadcasting]);

    const handleOnKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") handleCommit();
      },
      [handleCommit],
    );

    return (
      <input
        className={clsx({
          hasError,
        })}
        type={type}
        aria-label={label}
        {...inputProps}
        value={draft ?? toDisplayValue(value)}
        onChange={handleOnChange}
        onBlur={handleCommit}
        onKeyDown={handleOnKeyDown}
      />
    );
  },
);

Input.displayName = "Input";
