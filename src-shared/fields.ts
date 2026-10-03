import { fixingSources } from "./api/fixingSources.ts";
import type { Option, OptionsSource } from "./options/optionsSource.ts";
import { settlementStyleOptions } from "./settlementStyles.ts";

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
  { id: "expiryDate", label: "Expiry Date", input: "date" },
  { id: "expiryDays", label: "Expiry Days", input: "number" },
  { id: "deliveryDate", label: "Delivery Date", input: "date" },
  { id: "settlementStyle", label: "Settlement Style", input: "select" },
  { id: "settlementCcy", label: "Settlement Ccy", input: "text" },
  { id: "settlementFixingSource", label: "Fixing Source", input: "select" },
  { id: "strike", label: "Strike", input: "text" },
  { id: "callPut", label: "Call / Put", input: "text" },
  { id: "buySell", label: "Buy / Sell", input: "text" },
  { id: "ccyPair", label: "Ccy Pair", input: "text" },
  { id: "expiryCut", label: "Expiry Cut", input: "text" },
  { id: "premiumDate", label: "Premium Date", input: "date" },
  { id: "spotStream", label: "Spot Stream", input: "number" },
] as const satisfies readonly { id: string; label: string; input: InputType }[];

type FieldDefinition = (typeof fields)[number];
export type FieldId = FieldDefinition["id"];

/** Fields every product has: all but the deal-only spot stream. */
export type ProductFieldId = Exclude<FieldId, "spotStream">;

export type SelectFieldId = Extract<FieldDefinition, { input: "select" }>["id"];

/**
 * A select's options loaded from a source, with the value of another field
 * (`dependsOn`) as the parameter. They reload whenever that field changes,
 * and the field keeps its value if it is still an option, else gets the
 * first. Columns without a `dependsOn` value (the deal) use `defaultParam`.
 * With `existsFor`, the field exists only for those parameters: for any
 * other it is absent from the product's data (not just empty), can't be
 * written, and has no options to load.
 */
export type AsyncFieldOptions = {
  source: OptionsSource;
  dependsOn: ProductFieldId;
  defaultParam: string;
  existsFor?: readonly string[];
};

export type FieldOptions = readonly Option[] | AsyncFieldOptions;

/**
 * Where each select gets its options: a fixed list, or a source. Adding an
 * async field: write its fetcher (`defineOptionsSource`), mark the field
 * `input: "select"` above and add one entry here — loading, reloading,
 * reconciling and the dropdown are generic in every app.
 */
export const fieldOptions = {
  settlementStyle: settlementStyleOptions,
  settlementFixingSource: {
    source: fixingSources,
    dependsOn: "settlementStyle",
    // only cash-settled products have a fixing source, so the deal's broadcast
    // offers Cash's options
    defaultParam: "Cash",
    existsFor: ["Cash"],
  },
} satisfies Record<SelectFieldId, FieldOptions>;

export const isAsyncOptions = (
  options: FieldOptions,
): options is AsyncFieldOptions => "source" in options;

/** Every field whose options load asynchronously, with its options. */
export const asyncOptionFields = (
  Object.entries(fieldOptions) as [SelectFieldId, FieldOptions][]
).flatMap(([fieldId, options]) =>
  isAsyncOptions(options) ? [{ fieldId, options }] : [],
);

/** Whether an async field exists while the field it depends on is `param`. */
export const existsForParam = (options: AsyncFieldOptions, param: unknown) =>
  !options.existsFor || options.existsFor.includes(String(param));

const asyncOptionsOf = (fieldId: FieldId) =>
  asyncOptionFields.find((field) => field.fieldId === fieldId)?.options;

/** Whether a product has a field, read through `read`; most fields always do. */
export const fieldExists = (
  fieldId: FieldId,
  read: (fieldId: ProductFieldId) => unknown,
) => {
  const options = asyncOptionsOf(fieldId);
  return !options || existsForParam(options, read(options.dependsOn));
};

/** The field a field's existence depends on, if it can be absent. */
export const existenceDependencies = (fieldId: FieldId): ProductFieldId[] => {
  const options = asyncOptionsOf(fieldId);
  return options?.existsFor ? [options.dependsOn] : [];
};

/** The fields that stop existing when `fieldId` takes `value`: remove them. */
export const fieldsAbsentFor = (fieldId: ProductFieldId, value: unknown): ProductFieldId[] =>
  asyncOptionFields
    .filter(({ options }) => options.dependsOn === fieldId && !existsForParam(options, value))
    .map((field) => field.fieldId);

/** The deal column's options: each async field's, for its default parameter. */
export const dealOptionsRequests = asyncOptionFields.map(({ options }) => ({
  source: options.source,
  param: options.defaultParam,
}));

export const fieldLabels = Object.fromEntries(
  fields.map(({ id, label }) => [id, label]),
) as Record<FieldId, string>;

/** Each field's input type, typed per field (e.g. `notionalCcy` is "text"). */
export const fieldInputTypes = Object.fromEntries(
  fields.map(({ id, input }) => [id, input]),
) as { [F in FieldDefinition as F["id"]]: F["input"] };

/**
 * Shared grid rows of the columns layout: group header, product header, then
 * one row per field. Columns use `subgrid`, so a row has the same height in
 * every column (see `styles/columns.css`).
 */
export const columnsGridTemplateRows = `auto auto repeat(${fields.length}, auto)`;
