import { z } from "zod";
import { daysUntil, isOnOrAfter } from "../lib/date.ts";
import { optionalNumber, optionalString } from "../lib/schemas.ts";
import { DEFAULT_SETTLEMENT_STYLE, settlementStyles } from "../settlementStyles.ts";
import { type ProductUi, defineProduct } from "./productDefinition.ts";

export type VanillaProductStore = {
  ui: ProductUi;
  data: {
    productType: "VanillaProduct";
    cashSettlement: {
      settlementCcy: string;
      /** Only while `settlementStyle` is Cash (see `fieldOptions`). */
      settlementFixingSource?: string;
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

const ccySchema = z.string().max(6, "Must be at most 6 characters");
const dateSchema = optionalString(z.iso.date("Must be a valid date"));

export const vanillaProduct = defineProduct<VanillaProductStore["data"]>({
  label: "Vanilla Product",

  fieldPaths: {
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
        isValid: ({ optionsCommon: { base } }) =>
          isOnOrAfter(base.deliveryDate, base.expiryDate),
      },
    ],
  },

  derived: {
    expiryDays: {
      dependsOn: ["expiryDate"],
      compute: ({ optionsCommon: { base } }) => daysUntil(base.expiryDate),
    },
  },

  createData: (deal) => ({
    productType: "VanillaProduct",
    cashSettlement: {
      settlementCcy: "",
      // no settlementFixingSource: added once Cash's options load
    },
    optionsCommon: {
      base: {
        buySell: "",
        ccyPair: "",
        deliveryDate: "",
        expiryCut: "",
        expiryDate: "",
        expiryDays: NaN, // derived from expiryDate
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
    settlementStyle: DEFAULT_SETTLEMENT_STYLE,
  }),
});
