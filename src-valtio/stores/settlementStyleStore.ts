import { proxy } from "valtio";
import {
  type SettlementStyleOption,
  fetchSettlementStyles,
  toSettlementStyleValue,
} from "../api/settlementStyles.ts";

export type SettlementStyleStatus = "idle" | "loading" | "loaded" | "error";

export type SettlementStyleStore = {
  status: SettlementStyleStatus;
  options: SettlementStyleOption[];
  actions: {
    load(): Promise<void>;
  };
};

/** Settlement style options, loaded once and shared by every deal. */
export const settlementStyleStore = proxy<SettlementStyleStore>({
  status: "idle",
  options: [],
  actions: {
    async load() {
      const { status } = settlementStyleStore;
      if (status === "loading" || status === "loaded") return;
      settlementStyleStore.status = "loading";
      try {
        settlementStyleStore.options = await fetchSettlementStyles();
        settlementStyleStore.status = "loaded";
      } catch {
        settlementStyleStore.status = "error";
      }
    },
  },
});

/** The first option's value, or `""` until the options have loaded. */
export const firstSettlementStyleValue = () => {
  const first = settlementStyleStore.options[0];
  return first ? toSettlementStyleValue(first) : "";
};
