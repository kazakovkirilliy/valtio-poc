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

// --- developer settings, persisted to localStorage
export const toggleSpotPriceStreamEnabledAction = createEvent();
export const $isSpotPriceStreamEnabled = createStore(true).on(
  toggleSpotPriceStreamEnabledAction,
  (enabled) => !enabled,
);

export const toggleAutocalcEnabledAction = createEvent();
export const $isAutocalcEnabled = createStore(true).on(
  toggleAutocalcEnabledAction,
  (enabled) => !enabled,
);

/**
 * Restores the settings on load and saves every change (also kept in sync
 * across browser tabs). A stored value that isn't a boolean is ignored, so
 * the default applies.
 */
persist({
  store: $isSpotPriceStreamEnabled,
  keyPrefix: "effector-nested-devtools:",
  key: "isSpotPriceStreamEnabled",
  contract: z.boolean(),
});
persist({
  store: $isAutocalcEnabled,
  keyPrefix: "effector-nested-devtools:",
  key: "isAutocalcEnabled",
  contract: z.boolean(),
});

// --- deals (tabs)
/**
 * A deal is a set of units (its model), created at runtime — a side effect,
 * so it happens in an effect.
 */
const addNewDealEffect = createEffect(() => ({
  dealId: uuid(),
  // the deal gets only the settings it reads
  deal: createDealStore({ $isSpotPriceStreamEnabled, $isAutocalcEnabled }),
}));

export const addNewDealAction = createEvent();
export const setActiveDealAction = createEvent<string>();

connect({ clock: addNewDealAction, target: addNewDealEffect });

/**
 * The deals by id, in tab order (key order) — the same shape as groups and
 * products. A deal is a model, not data: the store holds references to its
 * units, and a deal's own changes happen in its own stores, never here.
 */
export const $deals = createStore<Record<string, DealStore>>({}).on(
  addNewDealEffect.doneData,
  (deals, { dealId, deal }) => ({ ...deals, [dealId]: deal }),
);

export const $activeDealId = createStore("")
  .on(addNewDealEffect.doneData, (_, { dealId }) => dealId)
  .on(setActiveDealAction, (_, dealId) => dealId);
