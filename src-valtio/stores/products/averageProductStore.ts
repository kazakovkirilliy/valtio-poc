import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";
import { z, type ZodType } from "zod";
import { daysUntil, isOnOrAfter } from "../../lib/date.ts";
import type { LeafPath } from "../../lib/path.ts";
import { optionalNumber, optionalString } from "../../lib/schemas.ts";
import type { DealStore } from "../dealStore.ts";
import type { ProductFieldId } from "../fields.ts";
import {
  subscribeDealBroadcasts,
  subscribeDealKey,
} from "../subscribeDealKey.ts";
import { type CrossFieldRule, validateFieldFactory } from "../validation.ts";
import { firstSettlementStyleValue } from "../settlementStyleStore.ts";

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

/** Where each field row lives in an Average product. */
export const averageFieldPaths: Record<
  ProductFieldId,
  LeafPath<AverageProductStore>
> = {
  notionalCcy: "data.avroCommon.base.notional.notionalCcy",
  notionalAmount: "data.avroCommon.base.notional.amount",
  premiumCcy: "data.avroCommon.base.premiumCcy",
  strike: "data.avroCommon.strike",
  callPut: "data.avroCommon.callPut",
  buySell: "data.avroCommon.base.buySell",
  ccyPair: "data.avroCommon.base.ccyPair",
  expiryDate: "data.avroCommon.base.expiryDate",
  expiryDays: "data.avroCommon.base.expiryDays",
  expiryCut: "data.avroCommon.base.expiryCut",
  deliveryDate: "data.avroCommon.base.deliveryDate",
  premiumDate: "data.avroCommon.base.premiumDate",
  settlementStyle: "data.settlementStyle",
  settlementCcy: "data.cashSettlement.settlementCcy",
  settlementFixingSource: "data.cashSettlement.settlementFixingSource",
};

/** Derived fields: shown read-only, never written by the user. */
export const averageReadOnlyFields: readonly ProductFieldId[] = ["expiryDays"];

const ccySchema = z.string().max(6, "Must be at most 6 characters");
const dateSchema = optionalString(z.iso.date("Must be a valid date"));

const averageSchemas: Record<ProductFieldId, ZodType> = {
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
  // an option id; the options themselves come from the API
  settlementStyle: z.string(),
  settlementCcy: ccySchema,
  settlementFixingSource: z.string().max(20, "Must be at most 20 characters"),
};

/**
 * Rules across fields, listed under the field that shows the issue. Each
 * re-runs when that field or a `dependsOn` field changes.
 */
const averageCrossFieldRules: Partial<
  Record<ProductFieldId, CrossFieldRule<AverageProductStore>[]>
> = {
  deliveryDate: [
    {
      dependsOn: [averageFieldPaths.expiryDate],
      message: "Delivery date can't be before expiry date",
      isValid: ({ data }) =>
        isOnOrAfter(
          data.avroCommon.base.deliveryDate,
          data.avroCommon.base.expiryDate,
        ),
    },
  ],
};

const createDefaults = ($dealStore: DealStore): AverageProductStore => ({
  ui: { title: "", index: 0 }, // set by the group on creation
  data: {
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
    // the first option once loaded; until then the deal fills it in on load
    settlementStyle: firstSettlementStyleValue(),
  },
});

/**
 * Average product factory.
 *
 * Syncs use `subscribeKey` rather than `valtio-reactive` effects: an effect
 * that reads the deal subscribes to the whole deal, and every write re-checks
 * every product's effects (nested, synchronously) — cost that grows much
 * faster than the product count. A key subscription does one cheap compare.
 * Sync notification (`true`) keeps all sides consistent within the keystroke.
 *
 * The synced fields are nested, so each `subscribeKey` targets the nested
 * proxy that owns the field. Those subscriptions are bound to the nested
 * objects created here — write leaf values (as `setValueByPath` does), never
 * replace the objects wholesale.
 *
 * `productPath` is the product's path from the deal (validation keys).
 * `initial` (a plain deep copy) seeds a clone. `dispose` drops every
 * subscription, so a removed product is never written to again.
 */
export const createAverageProductStore = (
  $dealStore: DealStore,
  productPath: string,
  initial?: AverageProductStore,
) => {
  const productStore = proxy<AverageProductStore>(
    initial ?? createDefaults($dealStore),
  );
  const { avroCommon } = productStore.data;
  const { base } = avroCommon;
  const { notional } = base;

  const subscriptions: Array<() => void> = [];
  const track = (unsubscribe: () => void) => subscriptions.push(unsubscribe);

  /**
   * Two-way Sync
   * Valtio ignores same-value writes, so the echo back stops after one hop.
   */
  track(
    subscribeDealKey(
      $dealStore,
      "premiumCcy",
      (value) => (base.premiumCcy = value),
    ),
  );
  track(
    subscribeKey(
      base,
      "premiumCcy",
      (value) => ($dealStore.premiumCcy = value),
      true,
    ),
  );

  /**
   * Two-way Sync
   */
  track(
    subscribeDealKey(
      $dealStore,
      "notionalCcy",
      (value) => (notional.notionalCcy = value),
    ),
  );
  track(
    subscribeKey(
      notional,
      "notionalCcy",
      (value) => ($dealStore.notionalCcy = value),
      true,
    ),
  );

  /**
   * One-way Sync
   * Every deal broadcast lands in this product's own field for it.
   */
  track(subscribeDealBroadcasts($dealStore, productStore, averageFieldPaths));

  /**
   * Derived field
   * Days from today until expiry, recomputed whenever expiryDate changes.
   * Sync, so expiryDays and its validation settle within the same keystroke.
   */
  track(
    subscribeKey(
      base,
      "expiryDate",
      (expiryDate) => (base.expiryDays = daysUntil(expiryDate)),
      true,
    ),
  );

  /**
   * Validation
   * Every field, against its schema and its cross-field rules above.
   */
  const validateField = validateFieldFactory(
    $dealStore,
    productStore,
    productPath,
  );
  (Object.keys(averageSchemas) as ProductFieldId[]).forEach((fieldId) =>
    track(
      validateField(
        averageFieldPaths[fieldId],
        averageSchemas[fieldId],
        averageCrossFieldRules[fieldId],
      ),
    ),
  );

  return {
    productStore,
    dispose: () => subscriptions.forEach((unsubscribe) => unsubscribe()),
  };
};
