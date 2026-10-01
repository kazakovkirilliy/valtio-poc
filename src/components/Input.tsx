import {
  useId,
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
  label: string;
  /**
   * - `text`: stores the string as typed.
   * - `number`: stores a number (`NaN` while the field is empty or invalid,
   *   so validation can flag it).
   * - `date`: stores an ISO `YYYY-MM-DD` string (`""` when cleared).
   */
  type?: "text" | "number" | "date";
  /**
   * Broadcast field: the text is held locally while typing and only written
   * to the store on commit (blur or Enter), where it propagates to the
   * subscribers and is then dropped — the value is never kept here.
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

export const Input = memo(
  ({
    path,
    label,
    type = "text",
    isBroadcasting = false,
    inputProps = {},
  }: Props) => {
    const id = useId();

    const actions = useDealStore().actions;
    const value = useDealValue(path);
    const { hasError } = useValidationError(path);

    const [draft, setDraft] = useState("");

    const handleOnChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isBroadcasting) setDraft(e.target.value);
        else
          actions.setValueByPath(
            path,
            type === "number" ? e.target.valueAsNumber : e.target.value,
          );
      },
      [actions, path, type, isBroadcasting],
    );

    const handleCommit = useCallback(() => {
      if (!isBroadcasting || !draft) return;
      actions.setValueByPath(path, draft);
      actions.setValueByPath(path, undefined);
      setDraft("");
    }, [actions, draft, path, isBroadcasting]);

    const handleOnKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") handleCommit();
      },
      [handleCommit],
    );

    return (
      <div>
        <label htmlFor={id}>{label}</label>
        <input
          className={clsx({
            hasError,
          })}
          type={type}
          {...inputProps}
          id={id}
          value={isBroadcasting ? draft : toDisplayValue(value)}
          onChange={handleOnChange}
          onBlur={handleCommit}
          onKeyDown={handleOnKeyDown}
        />
      </div>
    );
  },
);

Input.displayName = "Input";
