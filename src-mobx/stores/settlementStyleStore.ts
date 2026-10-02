import { observable, runInAction } from "mobx";
import {
  type SettlementStyleOption,
  fetchSettlementStyles,
  toSettlementStyleValue,
} from "../api/settlementStyles.ts";

export type SettlementStyleStatus = "idle" | "loading" | "loaded" | "error";

export type SettlementStyleStore = {
  status: SettlementStyleStatus;
  options: SettlementStyleOption[];
  /** The first option's value, or `""` until the options have loaded. */
  readonly firstValue: string;
  load(): Promise<void>;
};

/** Settlement style options, loaded once and shared by every deal. */
export const settlementStyleStore: SettlementStyleStore =
  observable<SettlementStyleStore>(
    {
      status: "idle",
      options: [],
      get firstValue() {
        const first = settlementStyleStore.options[0];
        return first ? toSettlementStyleValue(first) : "";
      },
      async load() {
        const { status } = settlementStyleStore;
        if (status === "loading" || status === "loaded") return;
        settlementStyleStore.status = "loading";
        try {
          const options = await fetchSettlementStyles();
          // after an `await` we're outside the action: wrap the writes
          runInAction(() => {
            settlementStyleStore.options = options;
            settlementStyleStore.status = "loaded";
          });
        } catch {
          runInAction(() => {
            settlementStyleStore.status = "error";
          });
        }
      },
    },
    {},
    { autoBind: true },
  );
