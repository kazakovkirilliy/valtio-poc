import { batch, observable } from "@legendapp/state";
import { ObservablePersistLocalStorage } from "@legendapp/state/persist-plugins/local-storage";
import { syncObservable } from "@legendapp/state/sync";
import { uuid } from "@shared/lib/uuid.ts";
import { type DealState, type DealStore, createDealStore, initialDealState } from "./dealStore.ts";

/** App-wide developer settings. */
export const devtools$ = observable({ isSpotPriceStreamEnabled: true, isAutocalcEnabled: true });

// persisted by Legend-State itself: loaded now, saved on every change
syncObservable(devtools$, {
  persist: { name: "legend-state-devtools", plugin: ObservablePersistLocalStorage },
});

export type MultiTabState = {
  activeDealId: string;
  dealIds: string[]; // tab order
  /** Every deal's state: the whole app is one tree of plain data (see `devtools.ts`). */
  deals: Record<string, DealState>;
};

export const multiTab$ = observable<MultiTabState>({ activeDealId: "", dealIds: [], deals: {} });

/** Each deal's actions and computeds, by id: not data, so kept beside the tree. */
export const dealStores = new Map<string, DealStore>();

export const addNewDeal = () => {
  const dealId = uuid();
  multiTab$.deals[dealId].set(initialDealState());
  // the deal gets only the settings it reads, and its own branch of the tree
  dealStores.set(dealId, createDealStore(devtools$, multiTab$.deals[dealId]));
  batch(() => {
    multiTab$.dealIds.set((ids) => [...ids, dealId]);
    multiTab$.activeDealId.set(dealId);
  });
};

export const setActiveDeal = (dealId: string) => multiTab$.activeDealId.set(dealId);
