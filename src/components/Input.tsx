import { useId, memo, useCallback } from "react";
import { getValueByPath } from "../utils/utils.ts";
import { useDealStoreSnapshot } from "../contexts/DealStoreProvider.tsx";

type Props = {
  path: string;
  label: string;
};

export const Input = memo(({ path, label }: Props) => {
  const id = useId();

  const snap = useDealStoreSnapshot();
  const value = getValueByPath(snap, path) as string;

  const handleOnChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      snap.actions.setValueByPath(path, e.target.value);
    },
    [snap.actions, path],
  );

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={handleOnChange} />
    </div>
  );
});

Input.displayName = "Input";
