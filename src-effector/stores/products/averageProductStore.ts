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

export type AverageProductStore = {
  ui: {
    title: string;
    index: number;
  };
  data: {
    productType: "AverageProduct";
    cashSettlement: {
      settlementCcy: string;
      settlementFixingSource: string;
    };
    avroCommon: {
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

type AverageData = AverageProductStore["data"];

/** Where each field row lives in an Average product's data. */
export const averageFieldPaths: Record<ProductFieldId, LeafPath<AverageData>> = {
  notionalCcy: "avroCommon.base.notional.notionalCcy",
  notionalAmount: "avroCommon.base.notional.amount",
  premiumCcy: "avroCommon.base.premiumCcy",
  strike: "avroCommon.strike",
  callPut: "avroCommon.callPut",
  buySell: "avroCommon.base.buySell",
  ccyPair: "avroCommon.base.ccyPair",
  expiryDate: "avroCommon.base.expiryDate",
  expiryDays: "avroCommon.base.expiryDays",
  expiryCut: "avroCommon.base.expiryCut",
  deliveryDate: "avroCommon.base.deliveryDate",
  premiumDate: "avroCommon.base.premiumDate",
  settlementStyle: "settlementStyle",
  settlementCcy: "cashSettlement.settlementCcy",
  settlementFixingSource: "cashSettlement.settlementFixingSource",
};

/** Derived fields: shown read-only, never written by the user. */
export const averageReadOnlyFields: readonly ProductFieldId[] = ["expiryDays"];

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
  Record<ProductFieldId, CrossFieldRule<AverageData>[]>
> = {
  deliveryDate: [
    {
      message: "Delivery date can't be before expiry date",
      isValid: ({ avroCommon: { base } }) =>
        isOnOrAfter(base.deliveryDate, base.expiryDate),
    },
  ],
};

export const createAverageData = (deal: DealFieldsState): AverageData => ({
  productType: "AverageProduct",
  cashSettlement: {
    settlementCcy: "",
    settlementFixingSource: "",
  },
  avroCommon: {
    base: {
      buySell: "",
      ccyPair: "",
      deliveryDate: "",
      expiryCut: "",
      expiryDate: "",
      expiryDays: NaN, // derived from expiryDate (see setAverageField)
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
export const setAverageField = (
  data: AverageData,
  fieldId: ProductFieldId,
  value: unknown,
): AverageData => {
  if (averageReadOnlyFields.includes(fieldId)) return data;
  const next = setIn(data, averageFieldPaths[fieldId], value);
  if (fieldId !== "expiryDate") return next;
  return setIn(next, averageFieldPaths.expiryDays, daysUntil(String(value)));
};

export const validateAverage = (data: AverageData): FieldIssues =>
  validateData(data, averageFieldPaths, schemas, crossFieldRules);
