import { observable, runInAction } from "mobx";
import {
  type FixingSourceOption,
  fetchFixingSources,
} from "../api/fixingSources.ts";

export type FixingSourceOptions = {
  status: "loading" | "loaded" | "error";
  options: FixingSourceOption[];
};

export type FixingSourceStore = {
  /** Fixing source options per settlement style, as last loaded. */
  byStyle: Record<string, FixingSourceOptions>;
  /** (Re)loads a style's options; resolves with them, or `undefined` on failure. */
  load(settlementStyle: string): Promise<FixingSourceOption[] | undefined>;
};

/** Shared by every deal: products with the same style share one list. */
export const fixingSourceStore: FixingSourceStore =
  observable<FixingSourceStore>(
    {
      byStyle: {},
      async load(settlementStyle) {
        const { byStyle } = fixingSourceStore;
        byStyle[settlementStyle] = {
          status: "loading",
          options: byStyle[settlementStyle]?.options ?? [],
        };
        try {
          const options = await fetchFixingSources(settlementStyle);
          // after an `await` we're outside the action: wrap the writes
          runInAction(() => {
            fixingSourceStore.byStyle[settlementStyle] = { status: "loaded", options };
          });
          return options;
        } catch {
          runInAction(() => {
            fixingSourceStore.byStyle[settlementStyle] = { status: "error", options: [] };
          });
          return undefined;
        }
      },
    },
    {},
    { autoBind: true },
  );
