import { proxy } from "valtio";
import { devtools } from "valtio/utils";
import { type DealStore, createDealStore } from "./dealStore.ts";
import { uuid } from "@shared/lib/uuid.ts";

import { persist } from "valtio-auto-persist";

export type DevToolsStore = {
  isSpotPriceStreamEnabled: boolean;
  isAutocalcEnabled: boolean;
};

const devtoolsDefaults: DevToolsStore = {
  isSpotPriceStreamEnabled: true,
  isAutocalcEnabled: true,
};

export const { store: devtoolsStore } = await persist<DevToolsStore>(devtoolsDefaults);

// valtio-auto-persist 2.2.3 returns an empty store when nothing is stored yet,
// dropping the initial state: fill in the defaults it left out
for (const key of Object.keys(devtoolsDefaults) as (keyof DevToolsStore)[]) {
  devtoolsStore[key] ??= devtoolsDefaults[key];
}

export type MultiTabStore = {
  devtools: DevToolsStore;
  activeDealId: string;
  deals: Record<string, DealStore>;
  actions: {
    addNewDeal(): void;
    setActiveDeal(activeDealId: string): void;
    toggleSpotPriceStreamEnabled(): void;
    toggleAutocalcEnabled(): void;
  };
};

export const multiTabStore = proxy<MultiTabStore>({
  devtools: devtoolsStore,
  activeDealId: "",
  deals: {},
  actions: {
    addNewDeal() {
      const newDaelId = uuid();
      multiTabStore.deals[newDaelId] = createDealStore();
      multiTabStore.activeDealId = newDaelId;
    },
    setActiveDeal(activeDealId: string) {
      multiTabStore.activeDealId = activeDealId;
    },
    toggleSpotPriceStreamEnabled() {
      devtoolsStore.isSpotPriceStreamEnabled =
        !devtoolsStore.isSpotPriceStreamEnabled;
    },
    toggleAutocalcEnabled() {
      devtoolsStore.isAutocalcEnabled = !devtoolsStore.isAutocalcEnabled;
    },
  },
});

devtools(multiTabStore, {
  name: "multiTab",
  // serializes the whole state tree on every change — keep it out of prod
  enabled: import.meta.env.DEV,
});
