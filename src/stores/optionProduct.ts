import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";
import { z, type ZodType } from "zod";
import type { DealBroadcastKey, DealStore } from "./dealStore.ts";
import type { VanillaProductStore } from "./vanillaProductStore.ts";
import type { AverageProductStore } from "./averageProductStore.ts";
import { validateFieldFactory } from "../utils/validateField.ts";
import { subscribeDealKey } from "../utils/subscribeDealKey.ts";
import { daysUntil, resolveParent, type LeafPath } from "../utils/utils.ts";

/**
 * Shared logic of the option products (Vanilla, Average). They are identical
 * except for the name of the common block: `optionsCommon` / `avroCommon`.
 */
type OptionProductStore = VanillaProductStore | AverageProductStore;

export type OptionsCommon = VanillaProductStore["data"]["optionsCommon"];
export type CommonKey = "optionsCommon" | "avroCommon";
/** `data` fields outside the common block. */
type SharedData = Omit<
  VanillaProductStore["data"],
  "productType" | "optionsCommon"
>;

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

export const createOptionsCommon = ($dealStore: DealStore): OptionsCommon => ({
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
});

export const createSharedData = (): SharedData => ({
  cashSettlement: {
    settlementCcy: "",
    settlementFixingSource: "",
  },
  settlementStyle: "",
});

/**
 * Option product factory.
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
 * `dispose` drops every subscription, so a removed product is never written
 * to again.
 */
export const createOptionProduct = <T extends OptionProductStore>(
  $dealStore: DealStore,
  productPath: string,
  state: T,
) => {
  const productStore = proxy<T>(state);

  const data = productStore.data;
  const commonKey: CommonKey =
    "optionsCommon" in data ? "optionsCommon" : "avroCommon";
  const common = "optionsCommon" in data ? data.optionsCommon : data.avroCommon;
  const base = common.base;
  const notional = base.notional;

  // product-relative paths, typed against the shared shapes
  const commonPath = (rest: LeafPath<OptionsCommon>) =>
    `data.${commonKey}.${rest}`;
  const dataPath = (rest: LeafPath<SharedData>) => `data.${rest}`;

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
   * Consume each deal broadcast command into this product's own field.
   * Exhaustive: adding a deal broadcast key fails to compile until mapped.
   * Sync notification is required: the broadcast is set and reset in one tick.
   */
  const broadcastTargets: Record<DealBroadcastKey, string> = {
    strike: commonPath("strike"),
    callPut: commonPath("callPut"),
    buySell: commonPath("base.buySell"),
    ccyPair: commonPath("base.ccyPair"),
    deliveryDate: commonPath("base.deliveryDate"),
    expiryCut: commonPath("base.expiryCut"),
    expiryDate: commonPath("base.expiryDate"),
    premiumDate: commonPath("base.premiumDate"),
    notionalAmount: commonPath("base.notional.amount"),
    settlementStyle: dataPath("settlementStyle"),
    settlementCcy: dataPath("cashSettlement.settlementCcy"),
    settlementFixingSource: dataPath("cashSettlement.settlementFixingSource"),
  };

  (Object.keys(broadcastTargets) as DealBroadcastKey[]).forEach((dealKey) => {
    const { parent, key } = resolveParent(
      productStore,
      broadcastTargets[dealKey],
    );
    if (!parent) throw new Error(`No field for broadcast "${dealKey}"`);
    track(
      subscribeDealKey($dealStore, dealKey, (broadcast) => {
        if (broadcast === undefined) return;
        parent[key] = broadcast;
      }),
    );
  });

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

  const validateField = validateFieldFactory<Record<string, unknown>>(
    $dealStore,
    productStore,
    productPath,
  );

  [
    validateField(commonPath("base.notional.notionalCcy"), ccySchema),
    validateField(commonPath("base.notional.amount"), amountSchema),
    validateField(commonPath("base.premiumCcy"), ccySchema),
    validateField(commonPath("base.premiumDate"), dateSchema),
    validateField(commonPath("base.buySell"), buySellSchema),
    validateField(commonPath("base.ccyPair"), ccyPairSchema),
    validateField(commonPath("base.expiryDate"), dateSchema),
    validateField(commonPath("base.expiryDays"), expiryDaysSchema),
    validateField(commonPath("base.expiryCut"), expiryCutSchema),
    validateField(commonPath("base.deliveryDate"), dateSchema),
    validateField(commonPath("strike"), strikeSchema),
    validateField(commonPath("callPut"), callPutSchema),
    validateField(dataPath("settlementStyle"), settlementStyleSchema),
    validateField(dataPath("cashSettlement.settlementCcy"), ccySchema),
    validateField(
      dataPath("cashSettlement.settlementFixingSource"),
      fixingSourceSchema,
    ),
  ].forEach(track);

  return {
    productStore,
    dispose: () => subscriptions.forEach((unsubscribe) => unsubscribe()),
  };
};
