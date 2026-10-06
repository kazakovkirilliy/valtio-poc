import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppName, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";

/**
 * Where the MST/keystone grid time goes at scale: the store work of a
 * broadcast (no grid subscribed) versus the product lookups the grid makes.
 */
const print = (label: string, value: unknown) => process.stdout.write(`\n[${label}] ${JSON.stringify(value)}\n`);

beforeEach(() => {
  vi.resetModules();
  installFakeApi({ Cash: [{ id: 4, name: "C4" }] });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("store-only cost of a broadcast to 300 products (no grid)", () => {
  it.each(["mobx", "mobx-state-tree", "mobx-keystone", "valtio", "zustand"] as const satisfies readonly AppName[])("%s", async (app) => {
    const adapter = await createAdapter(app);
    adapter.setAutocalc(true);
    for (let i = 0; i < 150; i++) adapter.addGroup("Strategy");
    await sleep(30);
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      adapter.deal().writePaths([{ path: "strike", value: String(i) }]);
      runs.push(performance.now() - start);
    }
    print(`${app} broadcast, store only (ms)`, runs.map((ms) => Math.round(ms)));
    expect(runs.length).toBe(5);
    adapter.dispose();
  }, 30000);
});

describe("mobx-state-tree: findProduct (linear) vs resolveIdentifier (MST's identifier index)", () => {
  it("4800 lookups, as a full grid read does three times over", async () => {
    const { observable } = await import("mobx");
    const { destroy, resolveIdentifier } = await import("mobx-state-tree");
    const { Deal } = await import("../../../src-mobx-state-tree/stores/dealModel.ts");
    const { Product } = await import("../../../src-mobx-state-tree/stores/productModel.ts");
    const deal = Deal.create({}, { devtools: observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false }) });
    for (let i = 0; i < 150; i++) deal.addNewGroup("Strategy");
    const ids = deal.products.map(({ id }) => id);
    let t = performance.now();
    for (let n = 0; n < 16; n++) for (const id of ids) deal.findProduct(id);
    const linear = performance.now() - t;
    t = performance.now();
    for (let n = 0; n < 16; n++) for (const id of ids) resolveIdentifier(Product, deal, id);
    const indexed = performance.now() - t;
    print("mst 4800 lookups (ms)", { findProduct: Math.round(linear), resolveIdentifier: Math.round(indexed) });
    expect(resolveIdentifier(Product, deal, ids[299])).toBe(deal.findProduct(ids[299])?.product);
    destroy(deal);
  });
});
