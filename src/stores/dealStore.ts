import { proxy, ref } from "valtio";
import { deepClone } from "valtio/utils";
import {
  type AnyProductStore,
  type ProductType,
  createProduct,
  getProductType,
  productTypeLabels,
} from "./productRegistry.ts";
import { uuid, setValueByPath, toValidationKey } from "../utils/utils.ts";
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
  products: Record<string, AnyProductStore>;
  productIds: string[]; // display order; each product's `ui.index` mirrors it
  isInternal: boolean;
  options: {
    hedgeTypes: string[];
  };
  spotPriceStream: SpotPriceStream;
  hasValidationErrors: boolean;
  validationErrors: Record<string, $ZodIssue[]>; // keyed by field name
  actions: {
    addNewProduct(productType: ProductType): void;
    cloneProduct(productId: string): void;
    removeProduct(productId: string): void;
    setValueByPath(path: string, value: unknown): void;
  };
};
export const createDealStore = (): DealStore => {
  const spotPriceStream = createSpotPriceStream();

  // kept outside the proxy: functions, never rendered or snapshotted
  const disposers = new Map<string, () => void>();

  /** Re-derives every product's index and title from its position. */
  const reindexProducts = () => {
    dealStore.productIds.forEach((productId, index) => {
      const product = dealStore.products[productId];
      // same-value writes are ignored, so unmoved products don't notify
      product.ui.index = index;
      product.ui.title = `${productTypeLabels[getProductType(product)]} #${index + 1}`;
    });
  };

  const insertProduct = (
    productType: ProductType,
    position: number,
    initial?: AnyProductStore,
  ) => {
    const productId = uuid();
    const { productStore, dispose } = createProduct(
      productType,
      dealStore,
      productId,
      initial,
    );
    disposers.set(productId, dispose);
    // record first, so the id never appears in the order without its product
    dealStore.products[productId] = productStore;
    dealStore.productIds.splice(position, 0, productId);
    reindexProducts();
  };

  const dealStore = proxy<DealStore>({
    notionalCcy: "1xxxxxx",
    premiumCcy: "2",
    strike: undefined,
    products: {},
    productIds: [],
    isInternal: true,
    spotPriceStream: ref(spotPriceStream), // ref(): valtio does not track it, so ticks never notify the deal proxy
    options: {
      hedgeTypes: [],
    },
    hasValidationErrors: false,
    validationErrors: {},
    actions: {
      addNewProduct(productType: ProductType) {
        insertProduct(productType, dealStore.productIds.length);
      },
      /** Inserts a copy of the product right after it. */
      cloneProduct(productId: string) {
        const position = dealStore.productIds.indexOf(productId);
        if (position === -1) return;
        const source = dealStore.products[productId];
        // plain deep copy: the clone gets its own proxies and subscriptions
        insertProduct(getProductType(source), position + 1, deepClone(source));
      },
      removeProduct(productId: string) {
        const position = dealStore.productIds.indexOf(productId);
        if (position === -1) return;

        disposers.get(productId)?.();
        disposers.delete(productId);

        // order first, so the id never appears without its product
        dealStore.productIds.splice(position, 1);
        delete dealStore.products[productId];

        const errorPrefix = toValidationKey(`products.${productId}.`);
        for (const key of Object.keys(dealStore.validationErrors)) {
          if (key.startsWith(errorPrefix)) {
            delete dealStore.validationErrors[key];
          }
        }

        reindexProducts();
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
