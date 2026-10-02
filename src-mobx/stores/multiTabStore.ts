import { autorun, observable } from "mobx";
import { uuid } from "@shared/lib/uuid.ts";
import { type DealStore, createDealStore } from "./dealStore.ts";

const DEVTOOLS_STORAGE_KEY = "mobx-devtools";

export type DevtoolsStore = {
  isSpotPriceStreamEnabled: boolean;
  toggleSpotPriceStreamEnabled(): void;
};

const loadDevtools = (): Partial<DevtoolsStore> => {
  try {
    return JSON.parse(localStorage.getItem(DEVTOOLS_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
};

/** App-wide developer settings, persisted to localStorage. */
const createDevtoolsStore = (): DevtoolsStore => {
  const devtools = observable<DevtoolsStore>(
    {
      isSpotPriceStreamEnabled: true,
      ...loadDevtools(),
      toggleSpotPriceStreamEnabled() {
        devtools.isSpotPriceStreamEnabled = !devtools.isSpotPriceStreamEnabled;
      },
    },
    {},
    { autoBind: true },
  );

  autorun(() => {
    const settings = {
      isSpotPriceStreamEnabled: devtools.isSpotPriceStreamEnabled,
    };
    try {
      localStorage.setItem(DEVTOOLS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // storage unavailable (private mode): keep the in-memory value
    }
  });

  return devtools;
};

export type MultiTabStore = {
  readonly devtools: DevtoolsStore;
  activeDealId: string;
  deals: Record<string, DealStore>;
  readonly dealIds: string[];
  addNewDeal(): void;
  setActiveDeal(activeDealId: string): void;
};

export const multiTabStore: MultiTabStore = observable<MultiTabStore>(
  {
    devtools: createDevtoolsStore(),
    activeDealId: "",
    deals: {},
    get dealIds() {
      return Object.keys(multiTabStore.deals);
    },
    addNewDeal() {
      const dealId = uuid();
      // the deal gets only the settings it reads, not the whole tab store
      multiTabStore.deals[dealId] = createDealStore(multiTabStore.devtools);
      multiTabStore.activeDealId = dealId;
    },
    setActiveDeal(activeDealId) {
      multiTabStore.activeDealId = activeDealId;
    },
  },
  { devtools: false },
  { autoBind: true },
);
