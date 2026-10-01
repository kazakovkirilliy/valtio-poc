import { memo } from "react";
import { Input } from "./Input.tsx";

type Props = {
  path: string;
  label: string;
  isBroadcasting?: boolean;
};

/** Date field: stores an ISO `YYYY-MM-DD` string, `""` when cleared. */
export const DateInput = memo(({ path, label, isBroadcasting }: Props) => (
  <Input
    type="date"
    label={label}
    path={path}
    isBroadcasting={isBroadcasting}
  />
));

DateInput.displayName = "DateInput";
