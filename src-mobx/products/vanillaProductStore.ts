import {
  type ProductOwner,
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

export type VanillaProductData = VanillaProductStore["data"];

export const createVanillaData = (owner: ProductOwner): VanillaProductData => ({
  productType: "VanillaProduct",
  ...createSharedData(),
  optionsCommon: createOptionsCommon(owner),
});
