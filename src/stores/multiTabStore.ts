import { proxy } from "valtio";
import { devtools } from "valtio/utils";
import { type DealStore, createDealStore } from "./dealStore.ts";
import { uuid } from "../utils/utils.ts";

export type MultiTabStore = {
  activeDealId: string;
  deals: Record<string, DealStore>;
  actions: {
    addNewDeal(): void;
    setActiveDeal(activeDealId: string): void;
  };
};

export const multiTabStore = proxy<MultiTabStore>({
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
  },
});

devtools(multiTabStore, {
  name: "multiTab",
  enabled: true,
});
