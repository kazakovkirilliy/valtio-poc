export type InputType = "text" | "number" | "date" | "select";

/**
 * Every field, in display order — the single list the label column, the
 * deal column, the product columns and the product stores all key off.
 * `input` is the field's input type wherever it is rendered.
 */
export const fields = [
  { id: "notionalCcy", label: "Notional Ccy", input: "text" },
  { id: "notionalAmount", label: "Notional Amount", input: "number" },
  { id: "premiumCcy", label: "Premium Ccy", input: "text" },
  { id: "strike", label: "Strike", input: "text" },
  { id: "callPut", label: "Call / Put", input: "text" },
  { id: "buySell", label: "Buy / Sell", input: "text" },
  { id: "ccyPair", label: "Ccy Pair", input: "text" },
  { id: "expiryDate", label: "Expiry Date", input: "date" },
  { id: "expiryDays", label: "Expiry Days", input: "number" },
  { id: "expiryCut", label: "Expiry Cut", input: "text" },
  { id: "deliveryDate", label: "Delivery Date", input: "date" },
  { id: "premiumDate", label: "Premium Date", input: "date" },
  { id: "settlementStyle", label: "Settlement Style", input: "select" },
  { id: "settlementCcy", label: "Settlement Ccy", input: "text" },
  { id: "settlementFixingSource", label: "Fixing Source", input: "text" },
  { id: "spotStream", label: "Spot Stream", input: "number" },
] as const satisfies readonly { id: string; label: string; input: InputType }[];

export type FieldId = (typeof fields)[number]["id"];

/** Fields every product has: all but the deal-only spot stream. */
export type ProductFieldId = Exclude<FieldId, "spotStream">;

export const fieldLabels = Object.fromEntries(
  fields.map(({ id, label }) => [id, label]),
) as Record<FieldId, string>;

/** Each field's input type, typed per field (e.g. `notionalCcy` is "text"). */
export const fieldInputTypes = Object.fromEntries(
  fields.map(({ id, input }) => [id, input]),
) as { [F in (typeof fields)[number] as F["id"]]: F["input"] };

/**
 * Shared grid rows of the columns layout: group header, product header, then
 * one row per field. Columns use `subgrid`, so a row has the same height in
 * every column (see `columns.css`).
 */
export const columnsGridTemplateRows = `auto auto repeat(${fields.length}, auto)`;
