import { memo } from "react";
import clsx from "clsx";
import type { Option, OptionsState } from "../options/optionsSource.ts";

type Props = {
  /** Accessible name only; the visible labels live in the label column. */
  label: string;
  value: unknown;
  options: readonly Option[];
  /** Options load asynchronously: the select is disabled until they arrive. */
  status: OptionsState["status"];
  hasError?: boolean;
  /** Commits immediately: picking an option is already a complete edit. */
  onCommit: (value: string) => void;
};

/** A dropdown over async options; shows "—" when nothing is selected. */
export const Select = memo(
  ({ label, value, options, status, hasError = false, onCommit }: Props) => {
    const current = value === undefined || value === null ? "" : String(value);
    // a value the options don't contain (yet) is still shown, not swapped
    const isUnknown =
      current !== "" && !options.some((option) => option.value === current);

    return (
      <select
        className={clsx("input", { "input--error": hasError })}
        aria-label={label}
        value={status === "loaded" ? current : ""}
        disabled={status !== "loaded"}
        onChange={(e) => onCommit(e.target.value)}
      >
        {status === "loading" && <option value="">Loading…</option>}
        {status === "error" && <option value="">Failed to load</option>}
        {status === "loaded" && current === "" && (
          <option value="" disabled>
            —
          </option>
        )}
        {status === "loaded" && isUnknown && (
          <option value={current}>{current}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  },
);

Select.displayName = "Select";
