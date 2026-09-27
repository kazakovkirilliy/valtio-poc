import { useId, memo, useCallback} from "react";
import {useSnapshot} from "valtio/react";
import {dealStore} from "../stores/dealStore.ts";
import {getValueByPath} from "../utils/utils.ts";

type Props = {
    path: string;
    label: string;
};

export const Input = memo(({path, label}: Props) => {
    const id = useId();

    const snap = useSnapshot(dealStore);
    const value = getValueByPath(snap,path) as string;

    const handleOnChange = useCallback((e: React.ChangeEvent<HTMLInputElement>)=>{
        snap.actions.setValueByPath(path,e.target.value);
    },[snap.actions,path])

    return <div>
        <label htmlFor={id}>{label}</label>
        <input id={id} value={value} onChange={handleOnChange}/>
    </div>;
});

Input.displayName = "Input";