import { proxy } from "valtio";
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
  actions: {
    load(settlementStyle: string): Promise<FixingSourceOption[] | undefined>;
  };
};

/** Shared by every deal: products with the same style share one list. */
export const fixingSourceStore = proxy<FixingSourceStore>({
  byStyle: {},
  actions: {
    /** (Re)loads a style's options; resolves with them, or `undefined` on failure. */
    async load(settlementStyle) {
      const { byStyle } = fixingSourceStore;
      byStyle[settlementStyle] = {
        status: "loading",
        options: byStyle[settlementStyle]?.options ?? [],
      };
      try {
        const options = await fetchFixingSources(settlementStyle);
        byStyle[settlementStyle] = { status: "loaded", options };
        return options;
      } catch {
        byStyle[settlementStyle] = { status: "error", options: [] };
        return undefined;
      }
    },
  },
});
