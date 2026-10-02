import { z } from "zod";
import type { $ZodIssue } from "zod/v4/core";
import type { SpotPriceStream } from "./spotPriceStream.ts";

export type StoreKind = "valtio" | "jotai" | "zustand";
export type CurrencyField = "notionalCcy" | "premiumCcy";
export type ProductField = "productNotionalCcy" | "productPremiumCcy" | "strike";
export type FieldPath = CurrencyField | `products.${string}.${ProductField}`;
// The view needs these Zod properties; readonly paths also accept Valtio snapshots.
export type Issues = readonly (Pick<$ZodIssue, "message" | "code"> & {
  readonly path: readonly PropertyKey[];
})[];

export const productFields = [
  "productNotionalCcy", "productPremiumCcy", "strike",
] as const;
export const initialCurrencies = { notionalCcy: "1xxxxxx", premiumCcy: "2" };
export const noIssues: Issues = [];
const currencySchema = z.string().max(6, "Must be at most 6 characters");
const strikeSchema = z.string().max(3, "Must be at most 3 characters");
const internalHedgeTypes = ["abc"] as const;
const externalHedgeTypes = ["def"] as const;

export const hedgeTypesFor = (isInternal: boolean) =>
  isInternal ? internalHedgeTypes : externalHedgeTypes;

export function validate(field: ProductField, value: string): Issues {
  const result = (field === "strike" ? strikeSchema : currencySchema).safeParse(value);
  return result.success ? noIssues : result.error.issues;
}

// Keep issue references stable when the validation message hasn't changed.
export function sameIssues(left: Issues, right: Issues) {
  return left.length === right.length &&
    left.every((issue, index) => issue.message === right[index].message);
}

export type ProductValues = Record<ProductField, string> & {
  validationErrors: Record<ProductField, Issues>;
};

export function createProductValues(notionalCcy: string, premiumCcy: string): ProductValues {
  return {
    productNotionalCcy: notionalCcy,
    productPremiumCcy: premiumCcy,
    strike: "",
    validationErrors: {
      productNotionalCcy: validate("productNotionalCcy", notionalCcy),
      productPremiumCcy: validate("productPremiumCcy", premiumCcy),
      strike: noIssues,
    },
  };
}

export function parseFieldPath(path: FieldPath):
  | { scope: "deal"; field: CurrencyField }
  | { scope: "product"; productId: string; field: ProductField } {
  if (path === "notionalCcy" || path === "premiumCcy") {
    return { scope: "deal", field: path };
  }
  const [scope, productId, field, extra] = path.split(".");
  if (scope !== "products" || !productId || extra ||
    !productFields.includes(field as ProductField)) {
    throw new Error(`Unknown field: ${path}`);
  }
  return { scope: "product", productId, field: field as ProductField };
}

export const productCurrencyField = (field: CurrencyField): ProductField =>
  field === "notionalCcy" ? "productNotionalCcy" : "productPremiumCcy";

export type DealActions = {
  addProduct(): string;
  setField(path: FieldPath, value: string): void;
  broadcastStrike(value: string): void;
  setInternal(value: boolean): void;
};

export type DealValues = {
  notionalCcy: string;
  premiumCcy: string;
  isInternal: boolean;
  productIds: string[];
  products: Record<string, ProductValues>;
  spotPriceStream: SpotPriceStream;
  actions: DealActions;
};

export type WorkspaceActions = {
  addDeal(): string;
  setActiveDeal(id: string): void;
  toggleSpotPriceStream(): void;
};

export function readStreamPreference(kind: StoreKind): boolean {
  try {
    return globalThis.localStorage?.getItem(`store-comparison:${kind}:spot:v1`) !== "false";
  } catch {
    return true;
  }
}

export function writeStreamPreference(kind: StoreKind, enabled: boolean) {
  try {
    globalThis.localStorage?.setItem(`store-comparison:${kind}:spot:v1`, String(enabled));
  } catch {
    // The in-memory setting still works when browser storage is unavailable.
  }
}
