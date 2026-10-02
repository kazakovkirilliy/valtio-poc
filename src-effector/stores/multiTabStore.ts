import { createEffect, createEvent, createStore, sample } from "effector";
import { uuid } from "../lib/uuid.ts";
import { type DealStore, createDealStore } from "./dealStore.ts";

const DEVTOOLS_STORAGE_KEY = "effector-devtools";

type DevtoolsSettings = { isSpotPriceStreamEnabled: boolean };

const loadDevtools = (): Partial<DevtoolsSettings> => {
  try {
    return JSON.parse(localStorage.getItem(DEVTOOLS_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
};

// --- developer settings, persisted to localStorage
export const toggleSpotPriceStreamEnabled = createEvent();
export const $isSpotPriceStreamEnabled = createStore(
  loadDevtools().isSpotPriceStreamEnabled ?? true,
).on(toggleSpotPriceStreamEnabled, (enabled) => !enabled);

$isSpotPriceStreamEnabled.watch((isSpotPriceStreamEnabled) => {
  try {
    localStorage.setItem(
      DEVTOOLS_STORAGE_KEY,
      JSON.stringify({ isSpotPriceStreamEnabled } satisfies DevtoolsSettings),
    );
  } catch {
    // storage unavailable (private mode): keep the in-memory value
  }
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

sample({ clock: addNewDeal, target: createDealFx });

export const $dealIds = createStore<string[]>([]).on(
  createDealFx.doneData,
  (dealIds, dealId) => [...dealIds, dealId],
);
export const $activeDealId = createStore("")
  .on(createDealFx.doneData, (_, dealId) => dealId)
  .on(setActiveDeal, (_, dealId) => dealId);
