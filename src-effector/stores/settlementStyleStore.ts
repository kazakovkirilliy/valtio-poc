import {
  createEffect,
  createEvent,
  createStore,
  sample as connect,
} from "effector";
import {
  type SettlementStyleOption,
  fetchSettlementStyles,
  toSettlementStyleValue,
} from "../api/settlementStyles.ts";

export type SettlementStyleStatus = "idle" | "loading" | "loaded" | "error";

/** Settlement style options, loaded once and shared by every deal. */
export const loadSettlementStylesFx = createEffect(fetchSettlementStyles);
export const loadSettlementStylesAction = createEvent();

export const $settlementStylesStatus = createStore<SettlementStyleStatus>("idle")
  .on(loadSettlementStylesFx, () => "loading")
  .on(loadSettlementStylesFx.doneData, () => "loaded")
  .on(loadSettlementStylesFx.failData, () => "error");

export const $settlementStyles = createStore<SettlementStyleOption[]>([]).on(
  loadSettlementStylesFx.doneData,
  (_, options) => options,
);

/** The first option's value, or `""` until the options have loaded. */
export const $firstSettlementStyleValue = $settlementStyles.map(([first]) =>
  first ? toSettlementStyleValue(first) : "",
);

// load once: a request while loading, or after a success, is ignored
connect({
  clock: loadSettlementStylesAction,
  source: $settlementStylesStatus,
  filter: (status) => status === "idle" || status === "error",
  fn: () => undefined,
  target: loadSettlementStylesFx,
});
