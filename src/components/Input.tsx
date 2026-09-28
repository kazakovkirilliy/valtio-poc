import {
  useId,
  memo,
  useCallback,
  useState,
  type DetailedHTMLProps,
  type InputHTMLAttributes,
} from "react";
import { getValueByPath } from "../utils/utils.ts";
import {
  useDealStoreSnapshot,
  useDealStore,
} from "../contexts/DealStoreProvider.tsx";
import clsx from "clsx";
import { useValidationError } from "../hooks/useValidationError.tsx";

type Props = {
  path: string;
  label: string;
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

export const Input = memo(
  ({ path, label, isBroadcasting = false, inputProps = {} }: Props) => {
    const id = useId();

    const snap = useDealStoreSnapshot();
    const actions = useDealStore().actions;
    const value = getValueByPath(snap, path) as string | undefined;
    const { hasError } = useValidationError(path);

    const [draft, setDraft] = useState("");

    const handleOnChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isBroadcasting) setDraft(e.target.value);
        else actions.setValueByPath(path, e.target.value);
      },
      [actions, path, isBroadcasting],
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
          {...inputProps}
          id={id}
          value={isBroadcasting ? draft : (value ?? "")}
          onChange={handleOnChange}
          onBlur={handleCommit}
          onKeyDown={handleOnKeyDown}
        />
      </div>
    );
  },
);

Input.displayName = "Input";
