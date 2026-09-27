import type { ChangeEvent } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export const Input = ({ value, onChange }: Props) => {
  const handleOnChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };
  return <input value={value} onChange={handleOnChange} />;
};
