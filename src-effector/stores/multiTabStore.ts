import {
  createEffect,
  createEvent,
  createStore,
  sample as connect,
} from "effector";
import { persist } from "effector-storage/local";
import { z } from "zod";
import { uuid } from "../lib/uuid.ts";
import { type DealStore, createDealStore } from "./dealStore.ts";

// --- developer settings, persisted to localStorage
export const toggleSpotPriceStreamEnabled = createEvent();
export const $isSpotPriceStreamEnabled = createStore(true).on(
  toggleSpotPriceStreamEnabled,
  (enabled) => !enabled,
);

/**
 * Restores the setting on load and saves every change (also kept in sync
 * across browser tabs). A stored value that isn't a boolean is ignored, so
 * the default applies.
 */
persist({
  store: $isSpotPriceStreamEnabled,
  keyPrefix: "effector-devtools:",
  key: "isSpotPriceStreamEnabled",
  contract: z.boolean(),
});

// --- deals (tabs)
/**
 * A deal is a set of units (its model), created at runtime — a side effect,
 * so it happens in an effect. Models are kept outside the stores; stores
 * hold only the ids.
 */
const dealModels = new Map<string, DealStore>();
export const getDealStore = (dealId: string) => dealModels.get(dealId)!;

const createDealFx = createEffect(() => {
  const dealId = uuid();
  // the deal gets only the settings it reads
  dealModels.set(dealId, createDealStore({ $isSpotPriceStreamEnabled }));
  return dealId;
});

export const addNewDeal = createEvent();
export const setActiveDeal = createEvent<string>();

connect({ clock: addNewDeal, target: createDealFx });

export const $dealIds = createStore<string[]>([]).on(
  createDealFx.doneData,
  (dealIds, dealId) => [...dealIds, dealId],
);
export const $activeDealId = createStore("")
  .on(createDealFx.doneData, (_, dealId) => dealId)
  .on(setActiveDeal, (_, dealId) => dealId);
