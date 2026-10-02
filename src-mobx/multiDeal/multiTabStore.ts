import { autorun, makeAutoObservable } from "mobx";
import { DealStore } from "../deal/dealStore.ts";
import { uuid } from "../lib/uuid.ts";

const DEVTOOLS_STORAGE_KEY = "mobx-devtools";

type DevtoolsSettings = { isSpotPriceStreamEnabled: boolean };

const loadDevtools = (): Partial<DevtoolsSettings> => {
  try {
    return JSON.parse(localStorage.getItem(DEVTOOLS_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
};

/** App-wide developer settings, persisted to localStorage. */
export class DevtoolsStore implements DevtoolsSettings {
  isSpotPriceStreamEnabled = true;

  constructor() {
    Object.assign(this, loadDevtools());
    makeAutoObservable(this, {}, { autoBind: true });

    autorun(() => {
      const settings: DevtoolsSettings = {
        isSpotPriceStreamEnabled: this.isSpotPriceStreamEnabled,
      };
      try {
        localStorage.setItem(DEVTOOLS_STORAGE_KEY, JSON.stringify(settings));
      } catch {
        // storage unavailable (private mode): keep the in-memory value
      }
    });
  }

  toggleSpotPriceStreamEnabled() {
    this.isSpotPriceStreamEnabled = !this.isSpotPriceStreamEnabled;
  }
}

export class MultiTabStore {
  readonly devtools = new DevtoolsStore();
  activeDealId = "";
  deals: Record<string, DealStore> = {};

  constructor() {
    makeAutoObservable(this, { devtools: false }, { autoBind: true });
  }

  get dealIds() {
    return Object.keys(this.deals);
  }

  addNewDeal() {
    const dealId = uuid();
    // the deal gets only the settings it reads, not the whole tab store
    this.deals[dealId] = new DealStore(this.devtools);
    this.activeDealId = dealId;
  }

  setActiveDeal(activeDealId: string) {
    this.activeDealId = activeDealId;
  }
}

export const multiTabStore = new MultiTabStore();
