import { memo, useId } from "react";
import { useAtomValue, useSetAtom } from "jotai/react";
import type { TextField } from "../state/workspace.ts";

export const TextInput = memo(function TextInput({ field, label }: { field: TextField; label: string }) {
  const id = useId();
  const value = useAtomValue(field.value);
  const error = useAtomValue(field.error);
  const setValue = useSetAtom(field.value);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        autoComplete="off"
      />
      {error ? <span className="field-error" id={`${id}-error`}>{error}</span> : null}
    </div>
  );
});
