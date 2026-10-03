import { type CellKey, type CellView, inputTypeOf } from "./gridSource.ts";

/** A cell's text, as shown and copied: a dropdown shows its option's label. */
export const cellText = (view: CellView | null): string => {
  const value = view?.value;
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return Number.isNaN(value) ? "" : String(value);
  const option = view?.options?.options.find((candidate) => candidate.value === String(value));
  return option?.label ?? String(value);
};

/** A number cell's value: `NaN` when empty, as the store expects. */
export const parseNumber = (text: string) => {
  const trimmed = text.trim();
  return trimmed === "" ? NaN : Number(trimmed);
};

/**
 * Pasted text as a cell's value, or `null` when it doesn't fit the cell.
 * Dropdowns take an option's value or its label. A cell without known
 * options (absent until another pasted value creates it, e.g. a fixing
 * source after a Cash style) takes the text: the store reconciles it.
 */
export const parseCellText = (
  key: CellKey,
  text: string,
  view: CellView | null,
): { value: unknown } | null => {
  const trimmed = text.trim();
  switch (inputTypeOf(key)) {
    case "number": {
      const value = parseNumber(trimmed.replaceAll(",", ""));
      return trimmed === "" || !Number.isNaN(value) ? { value } : null;
    }
    case "date":
      return trimmed === "" || /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? { value: trimmed } : null;
    case "select": {
      if (trimmed === "") return null;
      if (!view?.options) return { value: trimmed };
      const match = view.options.options.find(
        (option) => option.value === trimmed || option.label === trimmed,
      );
      return match ? { value: match.value } : null;
    }
    default:
      return { value: text };
  }
};
