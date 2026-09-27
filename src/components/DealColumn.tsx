import { Input } from "./Input.tsx";
import { useSnapshot } from "valtio/react";
import { dealStore } from "../stores/dealStore.ts";

export const DealColumn = () => {
  const state = useSnapshot(dealStore);

  return (
    <div className="column">
      <Input
        value={state.premiumCcy}
        onChange={(value) => {
          dealStore.setPremiumCcy(value);
        }}
      />
    </div>
  );
};
