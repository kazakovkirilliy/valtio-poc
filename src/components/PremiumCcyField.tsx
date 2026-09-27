import {useSnapshot} from "valtio/react";
import {dealStore} from "../stores/dealStore.ts";
import {memo} from "react";
import {Input} from "./Input.tsx";
import {getValueByPath} from "../utils/utils.ts";

type Props = {
    path: string;
    actionPath: string;
}

export const PremiumCcyField = memo(({path, actionPath}: Props) => {
    const snap = useSnapshot(dealStore);

    const value = getValueByPath(snap,path) as string;
    const action = getValueByPath(snap,actionPath) as ()=>void;

    return <Input
        label="Premium Ccy"
        value={value}
        onChange={action}
    />
});