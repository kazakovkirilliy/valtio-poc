import { memo } from "react";
import { Input } from "./Input.tsx";

type Props = {
  path: string;
  label: string;
};

/** Date field: stores an ISO `YYYY-MM-DD` string, `""` when cleared. */
export const DateInput = memo(({ path, label }: Props) => (
  <Input type="date" label={label} path={path} />
));

DateInput.displayName = "DateInput";
