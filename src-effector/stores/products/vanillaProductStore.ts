import { z, type ZodType } from "zod";
import { daysUntil, isOnOrAfter } from "../../lib/date.ts";
import { type LeafPath, setIn } from "../../lib/path.ts";
import { optionalNumber, optionalString } from "../../lib/schemas.ts";
import type { DealFieldsState } from "../dealFields.ts";
import type { ProductFieldId } from "../fields.ts";
import {
  type CrossFieldRule,
  type FieldIssues,
  validateData,
} from "../validation.ts";

export type VanillaProductStore = {
  ui: {
    title: string;
    index: number;
  };
  data: {
    productType: "VanillaProduct";
    cashSettlement: {
      settlementCcy: string;
      settlementFixingSource: string;
    };
    optionsCommon: {
      base: {
        buySell: string;
        ccyPair: string;
        deliveryDate: string;
        expiryCut: string;
        expiryDate: string;
        expiryDays: number;
        notional: {
          notionalCcy: string;
          amount: number;
        };
        premiumCcy: string;
        premiumDate: string;
      };
      callPut: string;
      strike: string;
    };
    settlementStyle: string;
  };
};

type VanillaData = VanillaProductStore["data"];

/** Where each field row lives in a Vanilla product's data. */
export const vanillaFieldPaths: Record<ProductFieldId, LeafPath<VanillaData>> = {
  notionalCcy: "optionsCommon.base.notional.notionalCcy",
  notionalAmount: "optionsCommon.base.notional.amount",
  premiumCcy: "optionsCommon.base.premiumCcy",
  strike: "optionsCommon.strike",
  callPut: "optionsCommon.callPut",
  buySell: "optionsCommon.base.buySell",
  ccyPair: "optionsCommon.base.ccyPair",
  expiryDate: "optionsCommon.base.expiryDate",
  expiryDays: "optionsCommon.base.expiryDays",
  expiryCut: "optionsCommon.base.expiryCut",
  deliveryDate: "optionsCommon.base.deliveryDate",
  premiumDate: "optionsCommon.base.premiumDate",
  settlementStyle: "settlementStyle",
  settlementCcy: "cashSettlement.settlementCcy",
  settlementFixingSource: "cashSettlement.settlementFixingSource",
};

/** Derived fields: shown read-only, never written by the user. */
export const vanillaReadOnlyFields: readonly ProductFieldId[] = ["expiryDays"];

const ccySchema = z.string().max(6, "Must be at most 6 characters");
const dateSchema = optionalString(z.iso.date("Must be a valid date"));

const schemas: Record<ProductFieldId, ZodType> = {
  notionalCcy: ccySchema,
  notionalAmount: optionalNumber(z.number().positive("Must be greater than 0")),
  premiumCcy: ccySchema,
  strike: z.string().max(3, "Must be at most 3 characters"),
  callPut: optionalString(z.enum(["Call", "Put"])),
  buySell: optionalString(z.enum(["Buy", "Sell"])),
  ccyPair: optionalString(
    z.string().regex(/^[A-Z]{6}$/, "Must be 6 uppercase letters, e.g. EURUSD"),
  ),
  expiryDate: dateSchema,
  expiryDays: optionalNumber(
    z.number().int().min(0, "Expiry date is in the past"),
  ),
  expiryCut: z.string().max(10, "Must be at most 10 characters"),
  deliveryDate: dateSchema,
  premiumDate: dateSchema,
  settlementStyle: optionalString(z.enum(["Physical", "Cash"])),
  settlementCcy: ccySchema,
  settlementFixingSource: z.string().max(20, "Must be at most 20 characters"),
};

/** Rules across fields, listed under the field that shows the issue. */
const crossFieldRules: Partial<
  Record<ProductFieldId, CrossFieldRule<VanillaData>[]>
> = {
  deliveryDate: [
    {
      message: "Delivery date can't be before expiry date",
      isValid: ({ optionsCommon: { base } }) =>
        isOnOrAfter(base.deliveryDate, base.expiryDate),
    },
  ],
};

export const createVanillaData = (deal: DealFieldsState): VanillaData => ({
  productType: "VanillaProduct",
  cashSettlement: {
    settlementCcy: "",
    settlementFixingSource: "",
  },
  optionsCommon: {
    base: {
      buySell: "",
      ccyPair: "",
      deliveryDate: "",
      expiryCut: "",
      expiryDate: "",
      expiryDays: NaN, // derived from expiryDate (see setVanillaField)
      notional: {
        notionalCcy: deal.notionalCcy,
        amount: NaN,
      },
      premiumCcy: deal.premiumCcy,
      premiumDate: "",
    },
    callPut: "",
    strike: "",
  },
  settlementStyle: "",
});

/**
 * Writes one field, immutably, keeping derived fields in step: every write
 * goes through here, so Expiry Days always follows Expiry Date.
 */
export const setVanillaField = (
  data: VanillaData,
  fieldId: ProductFieldId,
  value: unknown,
): VanillaData => {
  if (vanillaReadOnlyFields.includes(fieldId)) return data;
  const next = setIn(data, vanillaFieldPaths[fieldId], value);
  if (fieldId !== "expiryDate") return next;
  return setIn(next, vanillaFieldPaths.expiryDays, daysUntil(String(value)));
};

export const validateVanilla = (data: VanillaData): FieldIssues =>
  validateData(data, vanillaFieldPaths, schemas, crossFieldRules);
