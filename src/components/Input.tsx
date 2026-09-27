import {type ChangeEvent, useId, memo} from "react";

type Props = {
    label: string;
    value: string;
    onChange: (value: string) => void;
};

export const Input = memo(({label, value, onChange}: Props) => {
    const id = useId();
    const handleOnChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.value);
    };
    return <div>
        <label htmlFor={id}>{label}</label>
        <input id={id} value={value} onChange={handleOnChange}/>
    </div>;
});
