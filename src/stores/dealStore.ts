import { proxy } from "valtio";
import { type ProductStore, createProductStore } from "./productStore.ts";
import { uuid, setValueByPath } from "../utils/utils.ts";
import { effect } from "valtio-reactive";
import { devtoolsStore } from "./devToolsStore.ts";

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
    get hedgeTypes() {
      return this.isInternal ? ["abc"] : ["def"];
    },
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
    if (devtoolsStore.isSpotPriceStreamEnabled) {
      setInterval(() => {
        dealStore.spotPriceStreamValue += 1;
      }, 1000);
    }
  });

  return dealStore;
};
