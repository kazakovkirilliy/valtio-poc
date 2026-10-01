import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";
import type { DealStore } from "../deal/dealStore.ts";
import { dealBroadcastKeys } from "../deal/dealBroadcasts.ts";
import { subscribeDealKey } from "../deal/subscribeDealKey.ts";
import { validateFieldFactory } from "../deal/validation.ts";
import type { ProductFieldId } from "../fields/fields.ts";
import { daysUntil } from "../lib/date.ts";
import { resolveParent } from "../lib/path.ts";
import type { VanillaProductStore } from "./vanillaProductStore.ts";
import type { AverageProductStore } from "./averageProductStore.ts";
import {
  type CommonKey,
  type OptionsCommon,
  type SharedData,
  optionProductFieldPaths,
  optionProductSchemas,
} from "./optionProductFields.ts";

/**
 * Shared store logic of the option products (Vanilla, Average). They are
 * identical except for the name of the common block: `optionsCommon` /
 * `avroCommon`. Per-field paths and schemas live in `optionProductFields.ts`.
 */
type OptionProductStore = VanillaProductStore | AverageProductStore;

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
  const paths = optionProductFieldPaths(commonKey);

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
   * Broadcast keys are field ids, so `paths[dealKey]` fails to compile for a
   * broadcast with no product field.
   * Sync notification is required: the broadcast is set and reset in one tick.
   */
  dealBroadcastKeys.forEach((dealKey) => {
    const { parent, key } = resolveParent(productStore, paths[dealKey]);
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

  /**
   * Validation
   * Every product field, against its schema in `optionProductFields.ts`.
   */
  const validateField = validateFieldFactory<Record<string, unknown>>(
    $dealStore,
    productStore,
    productPath,
  );
  (Object.keys(optionProductSchemas) as ProductFieldId[]).forEach((fieldId) =>
    track(validateField(paths[fieldId], optionProductSchemas[fieldId])),
  );

  return {
    productStore,
    dispose: () => subscriptions.forEach((unsubscribe) => unsubscribe()),
  };
};
