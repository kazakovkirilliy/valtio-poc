import {
  createEffect,
  createEvent,
  createStore,
  sample as connect,
} from "effector";
import { persist } from "effector-storage/local";
import { z } from "zod";
import { uuid } from "@shared/lib/uuid.ts";
import { type DealStore, createDealStore } from "./dealStore.ts";
import { keysOf } from "./keys.ts";

// --- developer settings, persisted to localStorage
export const toggleSpotPriceStreamEnabledAction = createEvent();
export const $isSpotPriceStreamEnabled = createStore(true).on(
  toggleSpotPriceStreamEnabledAction,
  (enabled) => !enabled,
);

/**
 * Restores the setting on load and saves every change (also kept in sync
 * across browser tabs). A stored value that isn't a boolean is ignored, so
 * the default applies.
 */
persist({
  store: $isSpotPriceStreamEnabled,
  keyPrefix: "effector-nested-devtools:",
  key: "isSpotPriceStreamEnabled",
  contract: z.boolean(),
});

// --- deals (tabs)
/**
 * A deal is a set of units (its model), created at runtime — a side effect,
 * so it happens in an effect.
 */
const createDealFx = createEffect(() => ({
  dealId: uuid(),
  // the deal gets only the settings it reads
  deal: createDealStore({ $isSpotPriceStreamEnabled }),
}));

export const addNewDealAction = createEvent();
export const setActiveDealAction = createEvent<string>();

connect({ clock: addNewDealAction, target: createDealFx });

/**
 * The deals by id, in tab order (key order) — the same shape as groups and
 * products. A deal is a model, not data: the store holds references to its
 * units, and a deal's own changes happen in its own stores, never here.
 */
export const $deals = createStore<Record<string, DealStore>>({}).on(
  createDealFx.doneData,
  (deals, { dealId, deal }) => ({ ...deals, [dealId]: deal }),
);
/** The deal ids in order; changes only when a deal is added. */
export const $dealIds = keysOf($deals);

export const $activeDealId = createStore("")
  .on(createDealFx.doneData, (_, { dealId }) => dealId)
  .on(setActiveDealAction, (_, dealId) => dealId);
