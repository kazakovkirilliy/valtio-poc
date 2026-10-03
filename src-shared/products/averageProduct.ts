import { z } from "zod";
import { daysUntil, isOnOrAfter } from "../lib/date.ts";
import { optionalNumber, optionalString } from "../lib/schemas.ts";
import { DEFAULT_SETTLEMENT_STYLE, settlementStyles } from "../settlementStyles.ts";
import { type ProductUi, defineProduct } from "./productDefinition.ts";

export type AverageProductStore = {
  ui: ProductUi;
  data: {
    productType: "AverageProduct";
    cashSettlement: {
      settlementCcy: string;
      /** Only while `settlementStyle` is Cash (see `fieldOptions`). */
      settlementFixingSource?: string;
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

const ccySchema = z.string().max(6, "Must be at most 6 characters");
const dateSchema = optionalString(z.iso.date("Must be a valid date"));

export const averageProduct = defineProduct<AverageProductStore["data"]>({
  label: "Average Product",

  fieldPaths: {
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
  },

  schemas: {
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
    expiryDays: optionalNumber(z.number().int().min(0, "Expiry date is in the past")),
    expiryCut: z.string().max(10, "Must be at most 10 characters"),
    deliveryDate: dateSchema,
    premiumDate: dateSchema,
    settlementStyle: z.enum(settlementStyles),
    settlementCcy: ccySchema,
    // an option id; its options come from the API, per settlement style
    settlementFixingSource: z.string(),
  },

  rules: {
    deliveryDate: [
      {
        dependsOn: ["expiryDate"],
        message: "Delivery date can't be before expiry date",
        isValid: ({ avroCommon: { base } }) =>
          isOnOrAfter(base.deliveryDate, base.expiryDate),
      },
    ],
  },

  derived: {
    expiryDays: {
      dependsOn: ["expiryDate"],
      compute: ({ avroCommon: { base } }) => daysUntil(base.expiryDate),
    },
  },

  createData: (deal) => ({
    productType: "AverageProduct",
    cashSettlement: {
      settlementCcy: "",
      // no settlementFixingSource: added once Cash's options load
    },
    avroCommon: {
      base: {
        buySell: "",
        ccyPair: "",
        deliveryDate: "",
        expiryCut: "",
        expiryDate: "",
        expiryDays: NaN, // derived from expiryDate
        notional: {
          notionalCcy: deal.notionalCcy,
          amount: deal.notionalAmount,
        },
        premiumCcy: deal.premiumCcy,
        premiumDate: "",
      },
      callPut: "",
      strike: "",
    },
    settlementStyle: DEFAULT_SETTLEMENT_STYLE,
  }),
});
