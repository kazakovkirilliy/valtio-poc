import {proxy} from "valtio";
import {devtools} from 'valtio/utils'
import {type ProductStore,  createProductStore} from "./productStore.ts";
import {uuid} from "../utils/utils.ts";

type CcyPair = string;

export type DealStore = {
    premiumCcy: CcyPair;
    products: Record<string, ProductStore>;
    actions: {
        setPremiumCcy(newCcy: CcyPair): void;
        addNewProduct(): void;
    }
};


export const dealStore = proxy<DealStore>({
    premiumCcy: "X",
    products: {},
    actions: {
        setPremiumCcy(newCcy: CcyPair) {
            dealStore.premiumCcy = newCcy;
        },
        addNewProduct(){
            dealStore.products[uuid()]= createProductStore();
        }
    }
});

devtools(dealStore, {
    name: "deal",
    enabled: true
});