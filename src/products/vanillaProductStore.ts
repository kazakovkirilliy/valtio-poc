import { type DealStore } from "../deal/dealStore.ts";
import {
  createOptionProduct,
  createOptionsCommon,
  createSharedData,
} from "./optionProduct.ts";

export type VanillaProductStore = {
  ui: {
    title: string;
    index: number;
  };
  data: {
    productType: "VanillaProduct";
    cashSettlement: {
      settlementCcy: string;
      settlementFixingSource: string;
    };
    optionsCommon: {
      base: {
        buySell: string;
        ccyPair: string;
        deliveryDate: string;
        expiryCut: string;
        expiryDate: string;
        expiryDays: number;
        notional: {
          notionalCcy: string;
          amount: number;
        };
        premiumCcy: string;
        premiumDate: string;
      };
      callPut: string;
      strike: string;
    };
    settlementStyle: string;
  };
};

/**
 * Vanilla product factory — syncs, broadcasts and validation live in
 * `createOptionProduct`. `initial` (a plain deep copy) seeds a clone.
 */
export const createVanillaProductStore = (
  $dealStore: DealStore,
  productPath: string,
  initial?: VanillaProductStore,
) =>
  createOptionProduct(
    $dealStore,
    productPath,
    initial ?? {
      ui: { title: "", index: 0 }, // set by the group on creation
      data: {
        productType: "VanillaProduct",
        ...createSharedData(),
        optionsCommon: createOptionsCommon($dealStore),
      },
    },
  );
