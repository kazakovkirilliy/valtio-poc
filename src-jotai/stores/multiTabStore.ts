import { type PrimitiveAtom, atom, getDefaultStore } from "jotai/vanilla";
import { atomWithStorage } from "jotai/vanilla/utils";
import { type DealStore, createDealStore } from "./dealStore.ts";
import { uuid } from "@shared/lib/uuid.ts";

const store = getDefaultStore();

export type DevToolsStore = {
  isSpotPriceStreamEnabled: boolean;
  isAutocalcEnabled: boolean;
};

// persisted by jotai itself (localStorage, as JSON): read at once, saved on every change
const devtoolsAtom = atomWithStorage<DevToolsStore>(
  "jotai-devtools",
  { isSpotPriceStreamEnabled: true, isAutocalcEnabled: true },
  undefined, // the default storage
  { getOnInit: true }, // the stored value from the start, not once something subscribes
);

export type MultiTabStore = {
  devtoolsAtom: typeof devtoolsAtom;
  activeDealIdAtom: PrimitiveAtom<string>;
  dealsAtom: PrimitiveAtom<Record<string, DealStore>>;
  actions: {
    addNewDeal(): void;
    setActiveDeal(activeDealId: string): void;
    toggleSpotPriceStreamEnabled(): void;
    toggleAutocalcEnabled(): void;
  };
};

const addNewDealAtom = atom(null, (_get, set) => {
  const newDealId = uuid();
  // before anything is set: a new deal subscribes and starts loading, each flushing the store
  const dealStore = createDealStore(devtoolsAtom);
  set(multiTabStore.dealsAtom, (deals) => ({ ...deals, [newDealId]: dealStore }));
  set(multiTabStore.activeDealIdAtom, newDealId);
});
const setActiveDealAtom = atom(null, (_get, set, activeDealId: string) => {
  set(multiTabStore.activeDealIdAtom, activeDealId);
});
const toggleSpotPriceStreamEnabledAtom = atom(null, (_get, set) => {
  set(devtoolsAtom, (devtools) => ({ ...devtools, isSpotPriceStreamEnabled: !devtools.isSpotPriceStreamEnabled }));
});
const toggleAutocalcEnabledAtom = atom(null, (_get, set) => {
  set(devtoolsAtom, (devtools) => ({ ...devtools, isAutocalcEnabled: !devtools.isAutocalcEnabled }));
});

// named for the devtools (`devtools.ts`), which report each action by its label
addNewDealAtom.debugLabel = "addNewDeal";
setActiveDealAtom.debugLabel = "setActiveDeal";
toggleSpotPriceStreamEnabledAtom.debugLabel = "toggleSpotPriceStreamEnabled";
toggleAutocalcEnabledAtom.debugLabel = "toggleAutocalcEnabled";

export const multiTabStore: MultiTabStore = {
  devtoolsAtom,
  activeDealIdAtom: atom(""),
  dealsAtom: atom<Record<string, DealStore>>({}),
  actions: {
    addNewDeal: () => store.set(addNewDealAtom),
    setActiveDeal: (activeDealId) => store.set(setActiveDealAtom, activeDealId),
    toggleSpotPriceStreamEnabled: () => store.set(toggleSpotPriceStreamEnabledAtom),
    toggleAutocalcEnabled: () => store.set(toggleAutocalcEnabledAtom),
  },
};
