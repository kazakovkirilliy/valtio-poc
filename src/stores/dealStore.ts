import {proxy} from "valtio";
import {devtools} from 'valtio/utils'
import {type ProductStore,  createProductStore} from "./productStore.ts";
import {uuid, setValueByPath} from "../utils/utils.ts";

type CcyPair = string;

export type DealStore = {
    notionalCcy: CcyPair;
    premiumCcy: CcyPair;
    products: Record<string, ProductStore>;
    isInternal: boolean;
    hedgeTypes: string[];
    actions: {
        addNewProduct(): void;
        setValueByPath(path:string, value: unknown): void;
    }
};



export const dealStore = proxy<DealStore>({
    notionalCcy: "1",
    premiumCcy: "2",
    products: {},
    isInternal: true,
    get hedgeTypes(){
        return this.isInternal ? ['abc']: ["def"];
    },
    actions: {
        addNewProduct(){
            dealStore.products[uuid()]= createProductStore(dealStore);
        },
        setValueByPath(path:string, value: unknown) {
            setValueByPath(dealStore,path, value);
        }
    }
});

devtools(dealStore, {
    name: "deal",
    enabled: true
});