import {
  useId,
  memo,
  useCallback,
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

  inputProps?: DetailedHTMLProps<
    InputHTMLAttributes<HTMLInputElement>,
    HTMLInputElement
  >;
};

export const Input = memo(({ path, label, inputProps = {} }: Props) => {
  const id = useId();

  const snap = useDealStoreSnapshot();
  const actions = useDealStore().actions;
  const value = getValueByPath(snap, path) as string;
  const hasError = getValueByPath(
    snap,
    `validationErrors.${path.replaceAll(".", "_")}`,
  );
  // const hasError = useValidationError(path);

  const handleOnChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      actions.setValueByPath(path, e.target.value);
    },
    [actions, path],
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
        value={value}
        onChange={handleOnChange}
      />
    </div>
  );
});

Input.displayName = "Input";
