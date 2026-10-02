import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";
import { z, type ZodType } from "zod";
import { daysUntil } from "../../lib/date.ts";
import type { LeafPath } from "../../lib/path.ts";
import { optionalNumber, optionalString } from "../../lib/schemas.ts";
import type { DealStore } from "../dealStore.ts";
import type { ProductFieldId } from "../fields.ts";
import {
  subscribeDealBroadcasts,
  subscribeDealKey,
} from "../subscribeDealKey.ts";
import { validateFieldFactory } from "../validation.ts";

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

/** Where each field row lives in a Vanilla product. */
export const vanillaFieldPaths: Record<
  ProductFieldId,
  LeafPath<VanillaProductStore>
> = {
  notionalCcy: "data.optionsCommon.base.notional.notionalCcy",
  notionalAmount: "data.optionsCommon.base.notional.amount",
  premiumCcy: "data.optionsCommon.base.premiumCcy",
  strike: "data.optionsCommon.strike",
  callPut: "data.optionsCommon.callPut",
  buySell: "data.optionsCommon.base.buySell",
  ccyPair: "data.optionsCommon.base.ccyPair",
  expiryDate: "data.optionsCommon.base.expiryDate",
  expiryDays: "data.optionsCommon.base.expiryDays",
  expiryCut: "data.optionsCommon.base.expiryCut",
  deliveryDate: "data.optionsCommon.base.deliveryDate",
  premiumDate: "data.optionsCommon.base.premiumDate",
  settlementStyle: "data.settlementStyle",
  settlementCcy: "data.cashSettlement.settlementCcy",
  settlementFixingSource: "data.cashSettlement.settlementFixingSource",
};

/** Derived fields: shown read-only, never written by the user. */
export const vanillaReadOnlyFields: readonly ProductFieldId[] = ["expiryDays"];

const ccySchema = z.string().max(6, "Must be at most 6 characters");
const dateSchema = optionalString(z.iso.date("Must be a valid date"));

const vanillaSchemas: Record<ProductFieldId, ZodType> = {
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

const createDefaults = ($dealStore: DealStore): VanillaProductStore => ({
  ui: { title: "", index: 0 }, // set by the group on creation
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

/**
 * Vanilla product factory.
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
export const createVanillaProductStore = (
  $dealStore: DealStore,
  productPath: string,
  initial?: VanillaProductStore,
) => {
  const productStore = proxy<VanillaProductStore>(
    initial ?? createDefaults($dealStore),
  );
  const { optionsCommon } = productStore.data;
  const { base } = optionsCommon;
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
  track(subscribeDealBroadcasts($dealStore, productStore, vanillaFieldPaths));

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
   * Every field, against its schema above.
   */
  const validateField = validateFieldFactory(
    $dealStore,
    productStore,
    productPath,
  );
  (Object.keys(vanillaSchemas) as ProductFieldId[]).forEach((fieldId) =>
    track(validateField(vanillaFieldPaths[fieldId], vanillaSchemas[fieldId])),
  );

  return {
    productStore,
    dispose: () => subscriptions.forEach((unsubscribe) => unsubscribe()),
  };
};
