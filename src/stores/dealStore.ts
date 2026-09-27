import { createFactory } from "@mfellner/valtio-factory";

type CcyPair = string;

export type DealStore = {
  premiumCcy: CcyPair;
  products: any[];
};

export const dealStore = createFactory<DealStore>({
  premiumCcy: "",
  products: [],
})
  .actions({
    setPremiumCcy(newCcy: CcyPair) {
      this.premiumCcy = newCcy;
    },
  })
  .create();
