import { z, type ZodType } from "zod";
import type { $ZodIssue } from "zod/v4/core";
import { fields, type ProductFieldId } from "./fields.ts";
import { daysUntil, isOnOrAfter } from "./date.ts";

export type StoreKind = "jotai" | "zustand";
export type FieldValue = string | number;
export type Issues = readonly $ZodIssue[];
export type SyncedFieldId = "notionalCcy" | "premiumCcy";
export const initialCurrencies = { notionalCcy: "1xxxxxx", premiumCcy: "2" };
export const noIssues: Issues = [];
export const productFieldIds = fields.filter((field) => field.id !== "spotStream")
  .map((field) => field.id) as ProductFieldId[];
export const isSyncedField = (field: ProductFieldId): field is SyncedFieldId =>
  field === "notionalCcy" || field === "premiumCcy";
export const broadcastFieldIds = [
  "strike", "callPut", "buySell", "ccyPair", "deliveryDate", "expiryCut",
  "expiryDate", "premiumDate", "notionalAmount", "settlementStyle",
  "settlementCcy", "settlementFixingSource",
] as const satisfies readonly ProductFieldId[];
export type BroadcastFieldId = (typeof broadcastFieldIds)[number];

export const productDefinitions = {
  VanillaProduct: { label: "Vanilla Product", commonKey: "optionsCommon" },
  AverageProduct: { label: "Average Product", commonKey: "avroCommon" },
} as const;
export type ProductType = keyof typeof productDefinitions;
export const groupDefinitions = {
  VanillaGroup: { label: "Vanilla Group", productTypes: ["VanillaProduct"] },
  Strategy: { label: "Strategy", productTypes: ["VanillaProduct", "VanillaProduct"] },
  Average: { label: "Average", productTypes: ["AverageProduct"] },
} as const satisfies Record<string, { label: string; productTypes: readonly ProductType[] }>;
export type GroupType = keyof typeof groupDefinitions;
export const groupTypes = Object.keys(groupDefinitions) as GroupType[];

type CommonData = {
  base: {
    buySell: string;
    ccyPair: string;
    deliveryDate: string;
    expiryCut: string;
    expiryDate: string;
    expiryDays: number;
    notional: { notionalCcy: string; amount: number };
    premiumCcy: string;
    premiumDate: string;
  };
  callPut: string;
  strike: string;
};
type SettlementData = {
  cashSettlement: { settlementCcy: string; settlementFixingSource: string };
  settlementStyle: string;
};
export type ProductData = SettlementData & (
  | { productType: "VanillaProduct"; optionsCommon: CommonData }
  | { productType: "AverageProduct"; avroCommon: CommonData }
);

/** Paths match upstream's distinct nested product shapes. */
export function productFieldPath(type: ProductType, field: ProductFieldId) {
  const common = productDefinitions[type].commonKey;
  switch (field) {
    case "notionalCcy": return `${common}.base.notional.notionalCcy`;
    case "notionalAmount": return `${common}.base.notional.amount`;
    case "strike": case "callPut": return `${common}.${field}`;
    case "settlementStyle": return field;
    case "settlementCcy": case "settlementFixingSource": return `cashSettlement.${field}`;
    default: return `${common}.base.${field}`;
  }
}

export function getIn(target: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) =>
    value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, target);
}

/** Copy only the objects along a known field path. No store behavior lives here. */
export function setIn<T extends object>(target: T, path: string, value: unknown): T {
  const [key, ...rest] = path.split(".");
  const record = target as Record<string, unknown>;
  const previous = record[key];
  const next = rest.length ? setIn(previous as object, rest.join("."), value) : value;
  return Object.is(previous, next) ? target : { ...target, [key]: next };
}

export function createProductData(type: ProductType, currencies: typeof initialCurrencies): ProductData {
  const common: CommonData = {
    base: {
      buySell: "", ccyPair: "", deliveryDate: "", expiryCut: "", expiryDate: "",
      expiryDays: NaN, notional: { notionalCcy: currencies.notionalCcy, amount: NaN },
      premiumCcy: currencies.premiumCcy, premiumDate: "",
    },
    callPut: "", strike: "",
  };
  const settlement: SettlementData = {
    cashSettlement: { settlementCcy: "", settlementFixingSource: "" }, settlementStyle: "",
  };
  return type === "VanillaProduct" ?
    { ...settlement, productType: type, optionsCommon: common } :
    { ...settlement, productType: type, avroCommon: common };
}

export const readProductField = (data: ProductData, field: ProductFieldId): FieldValue =>
  getIn(data, productFieldPath(data.productType, field)) as FieldValue;

const optionalString = (schema: ZodType) => z.literal("").or(schema);
const optionalNumber = (schema: ZodType) => z.nan().or(schema);
const ccySchema = z.string().max(6, "Must be at most 6 characters");
const dateSchema = optionalString(z.iso.date("Must be a valid date"));
export const schemas: Record<ProductFieldId, ZodType> = {
  notionalCcy: ccySchema,
  notionalAmount: optionalNumber(z.number().positive("Must be greater than 0")),
  premiumCcy: ccySchema,
  strike: z.string().max(3, "Must be at most 3 characters"),
  callPut: optionalString(z.enum(["Call", "Put"])),
  buySell: optionalString(z.enum(["Buy", "Sell"])),
  ccyPair: optionalString(z.string().regex(/^[A-Z]{6}$/, "Must be 6 uppercase letters, e.g. EURUSD")),
  expiryDate: dateSchema,
  expiryDays: optionalNumber(z.number().int().min(0, "Expiry date is in the past")),
  expiryCut: z.string().max(10, "Must be at most 10 characters"),
  deliveryDate: dateSchema,
  premiumDate: dateSchema,
  settlementStyle: optionalString(z.enum(["Physical", "Cash"])),
  settlementCcy: ccySchema,
  settlementFixingSource: z.string().max(20, "Must be at most 20 characters"),
};

export function validateField(field: ProductFieldId, value: FieldValue, expiryDate = ""): Issues {
  const result = schemas[field].safeParse(value);
  const issues = result.success ? [] : [...result.error.issues];
  if (field === "deliveryDate" && !isOnOrAfter(String(value), expiryDate)) {
    issues.push({ code: "custom", path: [], message: "Delivery date can't be before expiry date" });
  }
  return issues.length ? issues : noIssues;
}

export const sameIssues = (left: Issues, right: Issues) => left.length === right.length &&
  left.every((issue, index) => issue.message === right[index].message);

export function validateProduct(data: ProductData): Record<ProductFieldId, Issues> {
  const expiryDate = String(readProductField(data, "expiryDate"));
  return Object.fromEntries(productFieldIds.map((field) =>
    [field, validateField(field, readProductField(data, field), expiryDate)])) as Record<ProductFieldId, Issues>;
}

export function copyProductData(source: ProductData) {
  let data = structuredClone(source);
  // Derived values are recalculated when cloning, including across midnight.
  data = setIn(data, productFieldPath(data.productType, "expiryDays"),
    daysUntil(String(readProductField(data, "expiryDate"))));
  return data;
}

export type ProductSummary = { id: string; title: string; productType: ProductType };
export type GroupSummary = { id: string; title: string; groupType: GroupType; products: readonly ProductSummary[] };
export type FieldTarget =
  | { scope: "deal"; field: SyncedFieldId }
  | { scope: "product"; groupId: string; productId: string; field: ProductFieldId };
export type DealActions = {
  addGroup(type: GroupType): string;
  cloneGroup(id: string): string | undefined;
  removeGroup(id: string): void;
  setField(target: FieldTarget, value: FieldValue): void;
  broadcast(field: BroadcastFieldId, value: FieldValue): void;
  setInternal(value: boolean): void;
};
export type WorkspaceActions = {
  addDeal(): string;
  setActiveDeal(id: string): void;
  toggleSpotPriceStream(): void;
};
const internalHedgeTypes = ["abc"] as const;
const externalHedgeTypes = ["def"] as const;
export const hedgeTypesFor = (internal: boolean) => internal ? internalHedgeTypes : externalHedgeTypes;

export function readStreamPreference(kind: StoreKind) {
  try { return globalThis.localStorage?.getItem(`store-comparison:${kind}:spot:v1`) !== "false"; }
  catch { return true; }
}
export function writeStreamPreference(kind: StoreKind, value: boolean) {
  try { globalThis.localStorage?.setItem(`store-comparison:${kind}:spot:v1`, String(value)); }
  catch { /* The in-memory setting remains usable without browser storage. */ }
}
