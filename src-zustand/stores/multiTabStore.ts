import { type StoreApi, createStore } from "zustand/vanilla";
import { devtools, persist } from "zustand/middleware";
import { type DealStore, createDealStore } from "./dealStore.ts";
import { uuid } from "@shared/lib/uuid.ts";

export type DevToolsState = {
  isSpotPriceStreamEnabled: boolean;
  isAutocalcEnabled: boolean;
};

export type DevToolsStore = StoreApi<DevToolsState>;

/**
 * App-wide developer settings, persisted by zustand itself: loaded from
 * localStorage now, saved on every change. `persist` goes outside `devtools`:
 * its own `setState` drops the action name, which `devtools` then never sees.
 */
export const devtoolsStore = createStore<DevToolsState>()(
  persist(
    devtools(
      () => ({
        isSpotPriceStreamEnabled: true,
        isAutocalcEnabled: true,
      }),
      { name: "Devtools (Zustand)", enabled: import.meta.env.DEV },
    ),
    { name: "zustand-devtools" },
  ),
);

export type MultiTabState = {
  activeDealId: string;
  deals: Record<string, DealStore>;
  actions: {
    addNewDeal(): void;
    setActiveDeal(activeDealId: string): void;
    toggleSpotPriceStreamEnabled(): void;
    toggleAutocalcEnabled(): void;
  };
};

export const multiTabStore = createStore<MultiTabState>()(
  devtools(
    (set) => ({
      activeDealId: "",
      deals: {},
      actions: {
        addNewDeal() {
          const dealId = uuid();
          // the deal gets only the settings it reads, not the whole tab store
          const dealStore = createDealStore(devtoolsStore);
          set((state) => ({ deals: { ...state.deals, [dealId]: dealStore }, activeDealId: dealId }), false, "addNewDeal");
        },
        setActiveDeal(activeDealId: string) {
          set({ activeDealId }, false, "setActiveDeal");
        },
        toggleSpotPriceStreamEnabled() {
          devtoolsStore.setState(
            (state) => ({ isSpotPriceStreamEnabled: !state.isSpotPriceStreamEnabled }),
            false,
            "toggleSpotPriceStreamEnabled",
          );
        },
        toggleAutocalcEnabled() {
          devtoolsStore.setState(
            (state) => ({ isAutocalcEnabled: !state.isAutocalcEnabled }),
            false,
            "toggleAutocalcEnabled",
          );
        },
      },
    }),
    {
      name: "Tabs (Zustand)",
      enabled: import.meta.env.DEV,
      // time travel sets the state back from its JSON: leave out what isn't
      // data (the actions, each deal's store), so a jump keeps the live ones
      serialize: {
        replacer: (key: string, value: unknown) => (key === "actions" || key === "deals" ? undefined : value),
      },
    },
  ),
);
