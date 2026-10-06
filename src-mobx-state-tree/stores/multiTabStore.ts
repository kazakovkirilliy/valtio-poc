import { onSnapshot, types } from "mobx-state-tree";
import { Deal, type DealEnv } from "./dealModel.ts";

const DEVTOOLS_STORAGE_KEY = "mobx-state-tree-devtools";

/** App-wide developer settings, persisted to localStorage. */
const Devtools = types
  .model("Devtools", {
    isSpotPriceStreamEnabled: true,
    isAutocalcEnabled: true,
  })
  .actions((self) => ({
    toggleSpotPriceStreamEnabled() {
      self.isSpotPriceStreamEnabled = !self.isSpotPriceStreamEnabled;
    },
    toggleAutocalcEnabled() {
      self.isAutocalcEnabled = !self.isAutocalcEnabled;
    },
  }));

const loadDevtools = () => {
  try {
    return JSON.parse(localStorage.getItem(DEVTOOLS_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
};

export const devtools = Devtools.create(loadDevtools());

onSnapshot(devtools, (snapshot) => {
  try {
    localStorage.setItem(DEVTOOLS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // storage unavailable (private mode): keep the in-memory value
  }
});

/** The open deals, one per tab. */
const MultiTab = types
  .model("MultiTab", {
    deals: types.array(Deal),
    activeDealId: "",
  })
  .actions((self) => ({
    addNewDeal() {
      self.deals.push({});
      self.activeDealId = self.deals[self.deals.length - 1].id;
    },
    setActiveDeal(activeDealId: string) {
      self.activeDealId = activeDealId;
    },
  }));

// every deal in the tree reads the developer settings from its environment
export const multiTabStore = MultiTab.create({}, { devtools } satisfies DealEnv);
