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

type Props = {
  path: string;
  label: string;
  /**
   * Broadcast field: the text is held locally while typing and only written
   * to the store on commit (blur or Enter), where it propagates to the
   * subscribers and is then dropped — the value is never kept here.
   */
  transient?: boolean;

  inputProps?: DetailedHTMLProps<
    InputHTMLAttributes<HTMLInputElement>,
    HTMLInputElement
  >;
};

export const Input = memo(
  ({ path, label, transient = false, inputProps = {} }: Props) => {
    const id = useId();

    const snap = useDealStoreSnapshot();
    const actions = useDealStore().actions;
    const value = getValueByPath(snap, path) as string | undefined;
    const hasError = getValueByPath(
      snap,
      `validationErrors.${path.replaceAll(".", "_")}`,
    );
    // const hasError = useValidationError(path);

    // A transient field types into `draft` only, so nothing reaches the store
    // — and no subscriber runs — until the edit is committed.
    const [draft, setDraft] = useState("");

    const handleOnChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (transient) setDraft(e.target.value);
        else actions.setValueByPath(path, e.target.value);
      },
      [actions, path, transient],
    );

    /**
     * Send the broadcast, then drop it. Valtio notifies synchronously, so the
     * subscribers have already consumed the value by the time it is reset —
     * and resetting to `undefined` (rather than "") is what tells them to
     * ignore the reset instead of wiping what they just received.
     */
    const handleCommit = useCallback(() => {
      if (!transient || !draft) return;
      actions.setValueByPath(path, draft);
      actions.setValueByPath(path, undefined);
      setDraft("");
    }, [actions, draft, path, transient]);

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
          value={transient ? draft : (value ?? "")}
          onChange={handleOnChange}
          onBlur={handleCommit}
          onKeyDown={handleOnKeyDown}
        />
      </div>
    );
  },
);

Input.displayName = "Input";
