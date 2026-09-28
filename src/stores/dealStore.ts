import { proxy } from "valtio";
import { type ProductStore, createProductStore } from "./productStore.ts";
import { uuid, setValueByPath } from "../utils/utils.ts";
import { effect } from "valtio-reactive";
import { multiTabStore } from "./multiTabStore.ts";
import type { $ZodIssue } from "zod/v4/core";

export type DealStore = {
  notionalCcy: string;
  premiumCcy: string;
  strike: string | undefined;
  products: Record<string, ProductStore>;
  isInternal: boolean;
  hedgeTypes: string[];
  spotPriceStreamValue: number;
  hasValidationErrors: boolean;
  validationErrors: Record<string, $ZodIssue[]>; // keyed by field name
  actions: {
    addNewProduct(): void;
    setValueByPath(path: string, value: unknown): void;
  };
};
export const createDealStore = (): DealStore => {
  const dealStore = proxy<DealStore>({
    notionalCcy: "1xxxxxx",
    premiumCcy: "2",
    strike: "",
    products: {},
    isInternal: true,
    spotPriceStreamValue: 0,
    hedgeTypes: [],
    hasValidationErrors: false,
    validationErrors: {},
    actions: {
      addNewProduct() {
        const productId = uuid();
        dealStore.products[productId] = createProductStore(
          dealStore,
          productId,
        );
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
