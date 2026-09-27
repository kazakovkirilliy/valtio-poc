import {proxy} from "valtio";
import {subscribeKey} from "valtio/utils";
import {dealStore} from "./dealStore.ts";


export type ProductStore = {
    productPremiumCcy: string;
    strike: string;
    actions: {
        setProductPremiumCcy(newCcy: string): void;
        setProductStrike(strike: string): void;
    }
};


/**
 * Product factory.
 */
export const createProductStore = () => {
    const productStore = proxy<ProductStore>({
        productPremiumCcy: dealStore.premiumCcy,
        strike: "",
        actions: {
            setProductPremiumCcy(newCcy: string) {
                productStore.productPremiumCcy = newCcy;
            },
            setProductStrike(strike: string) {
                productStore.strike = strike;
            }
        }
    });

    /**
     * Two-way Sync (part 1)
     */
    subscribeKey(dealStore,'premiumCcy',(premiumCcy)=>{
        productStore.productPremiumCcy = premiumCcy;
    })

    /**
     * Two-way Sync (part 2)
     */
    subscribeKey(productStore,'productPremiumCcy',(productPremiumCcy)=>{
        dealStore.premiumCcy = productPremiumCcy;
    })

    return productStore;
}
