/**
 * Every field row, in display order. The label column renders these labels;
 * every other column renders one cell per row (see `FieldCells`), so its
 * fields line up with their labels.
 */
export const fieldRows = [
  { id: "notionalCcy", label: "Notional Ccy" },
  { id: "notionalAmount", label: "Notional Amount" },
  { id: "premiumCcy", label: "Premium Ccy" },
  { id: "strike", label: "Strike" },
  { id: "callPut", label: "Call / Put" },
  { id: "buySell", label: "Buy / Sell" },
  { id: "ccyPair", label: "Ccy Pair" },
  { id: "expiryDate", label: "Expiry Date" },
  { id: "expiryDays", label: "Expiry Days" },
  { id: "expiryCut", label: "Expiry Cut" },
  { id: "deliveryDate", label: "Delivery Date" },
  { id: "premiumDate", label: "Premium Date" },
  { id: "settlementStyle", label: "Settlement Style" },
  { id: "settlementCcy", label: "Settlement Ccy" },
  { id: "settlementFixingSource", label: "Fixing Source" },
  { id: "spotStream", label: "Spot Stream" },
] as const;

export type FieldId = (typeof fieldRows)[number]["id"];

/** Accessible names for the inputs, which no longer show a visible label. */
export const fieldLabels = Object.fromEntries(
  fieldRows.map(({ id, label }) => [id, label]),
) as Record<FieldId, string>;

/**
 * Shared grid rows: group header, product header, then one row per field.
 * Columns use `subgrid`, so a row has the same height in every column.
 */
export const gridTemplateRows = `auto auto repeat(${fieldRows.length}, auto)`;
