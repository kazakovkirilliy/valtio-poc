import { Model, model, modelAction, onSnapshot, prop, registerRootStore } from "mobx-keystone";
import { Deal, devtoolsContext } from "./dealModel.ts";

const DEVTOOLS_STORAGE_KEY = "mobx-keystone-devtools";

/** App-wide developer settings, persisted to localStorage. */
@model("dealEditor/Devtools")
class Devtools extends Model({
  isSpotPriceStreamEnabled: prop(true),
  isAutocalcEnabled: prop(true),
}) {
  @modelAction toggleSpotPriceStreamEnabled() {
    this.isSpotPriceStreamEnabled = !this.isSpotPriceStreamEnabled;
  }

  @modelAction toggleAutocalcEnabled() {
    this.isAutocalcEnabled = !this.isAutocalcEnabled;
  }
}

const loadDevtools = (): { isSpotPriceStreamEnabled?: boolean; isAutocalcEnabled?: boolean } => {
  try {
    return JSON.parse(localStorage.getItem(DEVTOOLS_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
};

/** The open deals, one per tab, and the developer settings every deal reads. */
@model("dealEditor/MultiTab")
class MultiTab extends Model({
  devtools: prop(() => new Devtools(loadDevtools())),
  deals: prop<Deal[]>(() => []),
  activeDealId: prop(""),
}) {
  protected onInit() {
    devtoolsContext.set(this, this.devtools);
  }

  @modelAction addNewDeal() {
    const deal = new Deal({});
    this.deals.push(deal);
    this.activeDealId = deal.id;
  }

  @modelAction setActiveDeal(activeDealId: string) {
    this.activeDealId = activeDealId;
  }
}

export const multiTabStore = new MultiTab({});
// the root store: deals start their reactions as they join it
registerRootStore(multiTabStore);

onSnapshot(multiTabStore.devtools, ({ isSpotPriceStreamEnabled, isAutocalcEnabled }) => {
  try {
    localStorage.setItem(DEVTOOLS_STORAGE_KEY, JSON.stringify({ isSpotPriceStreamEnabled, isAutocalcEnabled }));
  } catch {
    // storage unavailable (private mode): keep the in-memory value
  }
});
