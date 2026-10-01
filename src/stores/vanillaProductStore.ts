import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";
import { type DealStore } from "./dealStore.ts";
import { z, type ZodType } from "zod";
import { validateFieldFactory } from "../utils/validateField.ts";
import { subscribeDealKey } from "../utils/subscribeDealKey.ts";
import { daysUntil } from "../utils/utils.ts";

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

/**
 * Fields start empty and are only checked once filled in: `""` for strings,
 * `NaN` for numbers (an empty number input).
 */
const optionalString = (schema: ZodType) => z.literal("").or(schema);
const optionalNumber = (schema: ZodType) => z.nan().or(schema);

const ccySchema = z.string().max(6, "Must be at most 6 characters");
const strikeSchema = z.string().max(3, "Must be at most 3 characters");
const dateSchema = optionalString(z.iso.date("Must be a valid date"));

const buySellSchema = optionalString(z.enum(["Buy", "Sell"]));
const callPutSchema = optionalString(z.enum(["Call", "Put"]));
const settlementStyleSchema = optionalString(z.enum(["Physical", "Cash"]));
const ccyPairSchema = optionalString(
  z.string().regex(/^[A-Z]{6}$/, "Must be 6 uppercase letters, e.g. EURUSD"),
);
const expiryCutSchema = z.string().max(10, "Must be at most 10 characters");
const fixingSourceSchema = z
  .string()
  .max(20, "Must be at most 20 characters");
const amountSchema = optionalNumber(
  z.number().positive("Must be greater than 0"),
);
const expiryDaysSchema = optionalNumber(
  z.number().int().min(0, "Expiry date is in the past"),
);

/**
 * Vanilla product factory.
 *
 * Same sync model as `createProductStore`, but the synced fields are nested,
 * so each `subscribeKey` targets the nested proxy that owns the field.
 * Those subscriptions are bound to the nested objects created here — write
 * leaf values (as `setValueByPath` does), never replace the objects wholesale.
 */
export const createVanillaProductStore = (
  $dealStore: DealStore,
  productId: string,
) => {
  // position in the deal at creation time
  const index = Object.keys($dealStore.products).length;

  const productStore = proxy<VanillaProductStore>({
    ui: {
      title: `Vanilla #${index + 1}`,
      index,
    },
    data: {
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
          expiryDays: NaN, // derived from expiryDate
          notional: {
            notionalCcy: $dealStore.notionalCcy,
            amount: NaN,
          },
          premiumCcy: $dealStore.premiumCcy,
          premiumDate: "",
        },
        callPut: "",
        strike: "",
      },
      settlementStyle: "",
    },
  });

  const optionsCommon = productStore.data.optionsCommon;
  const base = optionsCommon.base;
  const notional = base.notional;

  /**
   * Two-way Sync
   * Valtio ignores same-value writes, so the echo back stops after one hop.
   */
  subscribeDealKey(
    $dealStore,
    "premiumCcy",
    (value) => (base.premiumCcy = value),
  );
  subscribeKey(
    base,
    "premiumCcy",
    (value) => ($dealStore.premiumCcy = value),
    true,
  );

  /**
   * Two-way Sync
   */
  subscribeDealKey(
    $dealStore,
    "notionalCcy",
    (value) => (notional.notionalCcy = value),
  );
  subscribeKey(
    notional,
    "notionalCcy",
    (value) => ($dealStore.notionalCcy = value),
    true,
  );

  /**
   * One-way Sync
   * Consume the broadcast command into this product's own strike field.
   * Sync notification is required: the broadcast is set and reset in one tick.
   */
  subscribeDealKey(
    $dealStore,
    "strike",
    (broadcast) => {
      if (broadcast === undefined) return;
      optionsCommon.strike = broadcast;
    },
  );

  /**
   * Derived field
   * Days from today until expiry, recomputed whenever expiryDate changes.
   * Sync, so expiryDays and its validation settle within the same keystroke.
   */
  subscribeKey(
    base,
    "expiryDate",
    (expiryDate) => (base.expiryDays = daysUntil(expiryDate)),
    true,
  );

  const validateField = validateFieldFactory(
    $dealStore,
    productStore,
    productId,
  );

  validateField("data.optionsCommon.base.notional.notionalCcy", ccySchema);
  validateField("data.optionsCommon.base.notional.amount", amountSchema);
  validateField("data.optionsCommon.base.premiumCcy", ccySchema);
  validateField("data.optionsCommon.base.premiumDate", dateSchema);
  validateField("data.optionsCommon.base.buySell", buySellSchema);
  validateField("data.optionsCommon.base.ccyPair", ccyPairSchema);
  validateField("data.optionsCommon.base.expiryDate", dateSchema);
  validateField("data.optionsCommon.base.expiryDays", expiryDaysSchema);
  validateField("data.optionsCommon.base.expiryCut", expiryCutSchema);
  validateField("data.optionsCommon.base.deliveryDate", dateSchema);
  validateField("data.optionsCommon.strike", strikeSchema);
  validateField("data.optionsCommon.callPut", callPutSchema);
  validateField("data.settlementStyle", settlementStyleSchema);
  validateField("data.cashSettlement.settlementCcy", ccySchema);
  validateField(
    "data.cashSettlement.settlementFixingSource",
    fixingSourceSchema,
  );

  return productStore;
};
