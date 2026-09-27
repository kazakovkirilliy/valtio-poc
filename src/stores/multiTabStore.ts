import { proxy } from "valtio";
import { devtools } from "valtio/utils";
import { type DealStore, createDealStore } from "./dealStore.ts";
import { uuid } from "../utils/utils.ts";
import { devtoolsStore, type DevToolsStore } from "./devToolsStore.ts";

export type MultiTabStore = {
  devtools: DevToolsStore;
  activeDealId: string;
  deals: Record<string, DealStore>;
  actions: {
    addNewDeal(): void;
    setActiveDeal(activeDealId: string): void;
    toggleSpotPriceStreamEnabled(): void;
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
  },
});

devtools(multiTabStore, {
  name: "multiTab",
  enabled: true,
});
