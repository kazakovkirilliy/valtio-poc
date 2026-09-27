import {proxy} from "valtio";
import { type DealStore} from "./dealStore.ts";
import {effect} from "valtio-reactive";


export type ProductStore = {
    productNotionalCcy: string;
    productPremiumCcy: string;
    strike: string;
};


/**
 * Product factory.
 */
export const createProductStore = ($dealStore: DealStore) => {
    const productStore = proxy<ProductStore>({
        productNotionalCcy: "",
        productPremiumCcy: "",
        strike: ""
    });

    /**
     * Two-way Sync
     */
    effect(()=>{
        console.log("Premium Changed (Deal)");
        productStore.productPremiumCcy = $dealStore.premiumCcy
    })
    effect(()=>{
        console.log("Premium Changed (Product)");
        $dealStore.premiumCcy = productStore.productPremiumCcy
    })

    /**
     * Two-way Sync
     */
    effect(()=>{
        console.log("Notional Changed (Deal)");
        productStore.productNotionalCcy = $dealStore.notionalCcy;
    })
    effect(()=>{
        console.log("Notional Changed (Product)");
        $dealStore.notionalCcy = productStore.productNotionalCcy
    })

    return productStore;
}
