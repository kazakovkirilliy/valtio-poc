import { createEffect, createStore } from "effector";
import {
  type FixingSourceOption,
  fetchFixingSources,
} from "../api/fixingSources.ts";

export type FixingSourceOptions = {
  status: "loading" | "loaded" | "error";
  options: FixingSourceOption[];
};

/** (Re)loads the fixing source options for one settlement style. */
export const loadFixingSourcesFx = createEffect(fetchFixingSources);

/** Loads several styles at once (e.g. a new group's products); each settles on its own. */
export const loadFixingSourcesForStylesFx = createEffect(
  (settlementStyles: string[]) =>
    Promise.allSettled(settlementStyles.map((style) => loadFixingSourcesFx(style))),
);

/** Options per settlement style, as last loaded; shared by every deal. */
export const $fixingSourcesByStyle = createStore<
  Record<string, FixingSourceOptions>
>({})
  .on(loadFixingSourcesFx, (byStyle, style) => ({
    ...byStyle,
    [style]: { status: "loading", options: byStyle[style]?.options ?? [] },
  }))
  .on(loadFixingSourcesFx.done, (byStyle, { params: style, result }) => ({
    ...byStyle,
    [style]: { status: "loaded", options: result },
  }))
  .on(loadFixingSourcesFx.fail, (byStyle, { params: style }) => ({
    ...byStyle,
    [style]: { status: "error", options: [] },
  }));
