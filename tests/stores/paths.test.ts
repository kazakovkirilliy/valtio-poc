import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "effector";
import { installFakeApi, sleep } from "./support/fakeApi.ts";

/**
 * The `@effector/model` deal, through its dot paths only: the contract the
 * app being migrated relies on (`groups.<id>.products.<id>.data.<path>`, and
 * the deal's own fields and settings at the root).
 */
describe("effector-model: reading and writing by path", () => {
  let deal: Awaited<ReturnType<typeof createDeal>>;

  const createDeal = async () => {
    vi.resetModules();
    const { createDealStore } = await import("../../src-effector-model/stores/dealStore.ts");
    return createDealStore({ $isSpotPriceStreamEnabled: createStore(false), $isAutocalcEnabled: createStore(false) });
  };

  beforeEach(async () => {
    installFakeApi({ Cash: [{ id: 4, name: "C4" }, { id: 3, name: "Shared" }] });
    deal = await createDeal();
    deal.actions.addGroupAction("Strategy"); // two vanilla products
    deal.actions.addGroupAction("Average");
  });
  afterEach(() => {
    deal.dispose();
    vi.unstubAllGlobals();
  });

  /** The data path of a product, by group and product position. */
  const path = (group: number, product: number, dataPath: string) => {
    const { id, products } = deal.$groups.getState()[group];
    return `groups.${id}.products.${products[product].id}.data.${dataPath}`;
  };
  const strike = (group: number, product: number) => path(group, product, group === 1 ? "avroCommon.strike" : "optionsCommon.strike");

  it("reads any path: product data, the deal's synced fields and its settings", () => {
    expect(deal.readPath(path(0, 0, "productType"))).toBe("VanillaProduct");
    expect(deal.readPath(path(1, 0, "avroCommon.base.notional.notionalCcy"))).toBe("1xxxxxx");
    expect(deal.readPath("notionalCcy")).toBe("1xxxxxx");
    expect(deal.readPath("hedgeType")).toBe("a");
    expect(deal.readPath("strike")).toBeUndefined(); // a broadcast holds nothing
    expect(deal.readPath("groups.nope.products.nope.data.x")).toBeUndefined();
  });

  it("writes a batch of paths in one event, each product getting only its own writes", () => {
    const before = deal.$groups.getState();
    deal.actions.writePathsAction([
      { path: strike(0, 0), value: "1" },
      { path: path(0, 0, "optionsCommon.callPut"), value: "Call" },
      { path: strike(1, 0), value: "2" },
    ]);
    expect([deal.readPath(strike(0, 0)), deal.readPath(strike(0, 1)), deal.readPath(strike(1, 0))]).toEqual(["1", "", "2"]);
    expect(deal.readPath(path(0, 0, "optionsCommon.callPut"))).toBe("Call");
    // the untouched product keeps its item object
    expect(deal.$groups.getState()[0].products[1]).toBe(before[0].products[1]);
  });

  it("keeps each field's rules: syncs, broadcasts, derived and read-only fields, settings", () => {
    // a product's synced field is the two-way sync
    deal.actions.writePathsAction([{ path: path(1, 0, "avroCommon.base.notional.amount"), value: 500 }]);
    expect(deal.readPath("notionalAmount")).toBe(500);
    expect(deal.readPath(path(0, 1, "optionsCommon.base.notional.amount"))).toBe(500);
    // a deal broadcast reaches every product, whatever its own path
    deal.actions.writePathsAction([{ path: "strike", value: "9" }]);
    expect([deal.readPath(strike(0, 0)), deal.readPath(strike(1, 0))]).toEqual(["9", "9"]);
    // derived: computed, never written
    deal.actions.writePathsAction([{ path: path(0, 0, "optionsCommon.base.expiryDate"), value: "2999-01-01" }]);
    const days = deal.readPath(path(0, 0, "optionsCommon.base.expiryDays"));
    expect(days).toBeGreaterThan(0);
    deal.actions.writePathsAction([{ path: path(0, 0, "optionsCommon.base.expiryDays"), value: 1 }]);
    expect(deal.readPath(path(0, 0, "optionsCommon.base.expiryDays"))).toBe(days);
    // settings: a hedge type stays one of its options
    deal.actions.writePathsAction([{ path: "isInternal", value: false }]);
    expect(deal.readPath("hedgeType")).toBe("d");
  });

  it("a path that isn't a declared field is written as is; a path the deal doesn't have is ignored", () => {
    deal.actions.writePathsAction([
      { path: path(0, 0, "legacy.note"), value: "kept" },
      { path: "groups.nope.products.nope.data.x", value: 1 },
      { path: "no.such.root", value: 1 },
    ]);
    expect(deal.readPath(path(0, 0, "legacy.note"))).toBe("kept");
  });

  it("a fixing source exists only for Cash: written in order after the style, in one batch", async () => {
    const fixing = path(0, 0, "cashSettlement.settlementFixingSource");
    deal.actions.writePathsAction([{ path: fixing, value: "3" }]); // not Cash: no such field
    expect(deal.readPath(fixing)).toBeUndefined();
    deal.actions.writePathsAction([
      { path: path(0, 0, "settlementStyle"), value: "Cash" },
      { path: fixing, value: "3" },
    ]);
    expect(deal.readPath(fixing)).toBe("3");
    await sleep(20); // Cash's options reloaded: 3 is one of them, so it stays
    expect(deal.readPath(fixing)).toBe("3");
  });

  it("a path store updates only when its own value changes", () => {
    const $strike = deal.pathStore(strike(0, 0));
    expect(deal.pathStore(strike(0, 0))).toBe($strike); // one store per path
    const seen: unknown[] = [];
    const stop = $strike.updates.watch((value) => seen.push(value));
    deal.actions.writePathsAction([{ path: strike(0, 1), value: "5" }]); // the other product
    deal.actions.writePathsAction([{ path: strike(1, 0), value: "6" }]); // another group
    deal.actions.writePathsAction([{ path: strike(0, 0), value: "7" }]);
    expect(seen).toEqual(["7"]);
    stop();
  });
});
