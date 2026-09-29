import { proxy, ref } from "valtio";
import { type ProductStore, createProductStore } from "./productStore.ts";
import { uuid, setValueByPath } from "../utils/utils.ts";
import { effect } from "valtio-reactive";
import { multiTabStore } from "./multiTabStore.ts";
import type { $ZodIssue } from "zod/v4/core";
import {
  type SpotPriceStream,
  createSpotPriceStream,
} from "./spotPriceStream.ts";

export type DealStore = {
  notionalCcy: string;
  premiumCcy: string;
  strike: string | undefined;
  products: Record<string, ProductStore>;
  isInternal: boolean;
  options: {
    hedgeTypes: string[];
  };
  spotPriceStream: SpotPriceStream;
  hasValidationErrors: boolean;
  validationErrors: Record<string, $ZodIssue[]>; // keyed by field name
  actions: {
    addNewProduct(): void;
    setValueByPath(path: string, value: unknown): void;
  };
};
export const createDealStore = (): DealStore => {
  const spotPriceStream = createSpotPriceStream();

  const dealStore = proxy<DealStore>({
    notionalCcy: "1xxxxxx",
    premiumCcy: "2",
    strike: undefined,
    products: {},
    isInternal: true,
    spotPriceStream: ref(spotPriceStream), // ref(): valtio does not track it, so ticks never notify the deal proxy
    options: {
      hedgeTypes: [],
    },
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
      spotPriceStream.start();
    } else {
      spotPriceStream.stop();
    }
  });

  const options = dealStore.options;
  effect(() => (options.hedgeTypes = dealStore.isInternal ? ["abc"] : ["def"]));

  return dealStore;
};
