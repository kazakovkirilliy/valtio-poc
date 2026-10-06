// Retained heap per group and per product: build K groups of one kind, gc, read the heap; the slope between K=20 and K=80
// removes the fixed cost. Vanilla (1 product) and Strategy (2 products) separate the per-group cost from the per-product one.
import { afterEach, describe, it, vi } from "vitest";
import { type DealAdapter, appNames, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi } from "../../stores/support/fakeApi.ts";
import { flush, heapMB, recordCells, recordEmits, selectedApps, sleep, turn, writeResults } from "./harness.ts";

let adapters: DealAdapter[] = [];
afterEach(() => {
  adapters.forEach((adapter) => adapter.dispose());
  adapters = [];
  vi.unstubAllGlobals();
});

type Kind = "VanillaGroup" | "Strategy" | "Average";
type Mode = "headless" | "shipped";

const heapAfter = async (app: (typeof appNames)[number], mode: Mode, kind: Kind, groups: number) => {
  installFakeApi({ Cash: [{ id: 1, name: "A" }], Delivery: [] });
  const adapter = await createAdapter(app);
  adapters.push(adapter);
  const deal = adapter.deal();
  if (mode === "shipped") {
    recordCells(adapter.grid());
    recordEmits(deal);
    if (app === "mobx" || app === "mobx-state-tree" || app === "mobx-keystone") {
      const { autorun } = await import("mobx");
      autorun(() => {
        adapter.hasValidationErrors();
        adapter.calc();
      });
    }
  }
  deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
  await sleep(30);
  await turn();
  const base = heapMB();
  for (let i = 0; i < groups; i++) deal.addGroup(kind);
  await flush();
  await turn();
  const after = heapMB();
  adapter.dispose();
  adapters = [];
  return after - base;
};

describe("memory", () => {
  it.each(selectedApps(appNames))("%s", async (app) => {
    const out: Record<string, unknown> = {};
    for (const mode of ["headless", "shipped"] as Mode[]) {
      const kb = async (kind: Kind) => {
        await heapAfter(app, mode, kind, 20); // warm
        const small = await heapAfter(app, mode, kind, 20);
        const big = await heapAfter(app, mode, kind, 80);
        return ((big - small) * 1024) / 60; // KB per group
      };
      const vanilla = await kb("VanillaGroup");
      const strategy = await kb("Strategy");
      const average = await kb("Average");
      const perProduct = strategy - vanilla;
      out[mode] = {
        kbPerVanillaGroup: vanilla,
        kbPerStrategyGroup: strategy,
        kbPerAverageGroup: average,
        kbPerProduct: perProduct,
        kbFixedPerGroup: 2 * vanilla - strategy,
      };
    }
    writeResults(`memory-${app}`, out);
  }, 20 * 60 * 1000);
});
