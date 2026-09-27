import {proxy} from "valtio";
import {devtools} from 'valtio/utils'
import {type DealStore} from "./dealStore.ts";
import {uuid, setValueByPath} from "../utils/utils.ts";


export type MultiTabStore = {
    deals: Record<string, DealStore>;
    actions: {
        addNewDeal(): void;
        setValueByPath(path:string, value: unknown): void;
    }
};


export const multiTabStore = proxy<MultiTabStore>({
    deals: {},
    actions: {
        addNewDeal(){
            // multiTabStore.deals[uuid()]= createDealStore(multiTabStore);
        },
        setValueByPath(path:string, value: unknown) {
            setValueByPath(multiTabStore,path, value);
        }

    }
});

devtools(multiTabStore, {
    name: "multiTab",
    enabled: true
});