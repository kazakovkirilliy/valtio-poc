import { proxy } from "valtio";
import { type ProductStore, createProductStore } from "./productStore.ts";
import { uuid, setValueByPath } from "../utils/utils.ts";
import { effect } from "valtio-reactive";
import { multiTabStore } from "./multiTabStore.ts";

type CcyPair = string;

export type DealStore = {
  notionalCcy: CcyPair;
  premiumCcy: CcyPair;
  products: Record<string, ProductStore>;
  isInternal: boolean;
  hedgeTypes: string[];
  spotPriceStreamValue: number;
  actions: {
    addNewProduct(): void;
    setValueByPath(path: string, value: unknown): void;
  };
};

export const createDealStore = (): DealStore => {
  const dealStore = proxy<DealStore>({
    notionalCcy: "1",
    premiumCcy: "2",
    products: {},
    isInternal: true,
    spotPriceStreamValue: 0,
    hedgeTypes: [],
    actions: {
      addNewProduct() {
        dealStore.products[uuid()] = createProductStore(dealStore);
      },
      setValueByPath(path: string, value: unknown) {
        setValueByPath(dealStore, path, value);
      },
    },
  });

  effect(() => {
    if (multiTabStore.devtools.isSpotPriceStreamEnabled) {
      setInterval(() => {
        dealStore.spotPriceStreamValue += 1;
      }, 1000);
    }
  });

  effect(
    () => (dealStore.hedgeTypes = dealStore.isInternal ? ["abc"] : ["def"]),
  );

  return dealStore;
};
