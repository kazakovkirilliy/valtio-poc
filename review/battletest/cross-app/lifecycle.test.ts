import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AppName,
  type ControlledApi,
  type DealHandle,
  type Page,
  appNames,
  calcControl,
  exactJson,
  flush,
  installControlledApi,
  itFor,
  launch,
  mockCalculate,
  ops,
  recorder,
  saveResults,
  snapshot,
} from "./support/harness.ts";

/** Groups coming and going, deals disposed, and two deals (tabs) sharing one page's modules. */

const seen: Record<string, Partial<Record<AppName, unknown>>> = {};
const note = (key: string, app: AppName, value: unknown) => {
  if (!seen[key]) seen[key] = {};
  seen[key][app] = value;
};

describe.each(appNames)("%s: lifecycle", (app) => {
  let page: Page;
  let h: DealHandle;
  let d: ReturnType<typeof ops>;

  beforeEach(async () => {
    installControlledApi({ Cash: [{ id: 4, name: "C4" }, { id: 3, name: "Shared" }] }, "auto");
    mockCalculate("auto");
    page = await launch(app);
    [h] = page.deals;
    d = ops(h.deal);
  });
  afterEach(() => {
    page.deals.forEach((deal) => {
      try {
        deal.dispose();
      } catch {
        // disposed by the test already (keystone's unregister isn't idempotent)
      }
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("removing every group, then adding again: renumbered from 1, from the deal's values, nothing of the old products left", async () => {
    h.deal.addGroup("Strategy");
    h.deal.addGroup("Average");
    d.write([
      { path: "notionalCcy", value: "USD" },
      { path: "notionalAmount", value: 700 },
      { path: "strike", value: "1234" }, // invalid everywhere
    ]);
    await flush();
    const oldPath = d.path(0, "strike");
    const oldIds = d.products().map(({ productId }) => productId);
    expect(h.hasValidationErrors()).toBe(true);
    while (h.deal.getGroups().length) h.deal.removeGroup(h.deal.getGroups()[0].id);
    await flush();
    expect([d.count(), h.hasValidationErrors()]).toEqual([0, false]);
    h.deal.writePaths([{ path: oldPath, value: "1" }]); // a removed product's path: ignored
    h.deal.addGroup("VanillaGroup");
    await flush();
    expect(d.titles()).toEqual(["Vanilla Group #1"]);
    expect(d.productTitles()).toEqual(["Vanilla Product #1"]);
    expect(oldIds).not.toContain(d.products()[0].productId);
    expect([d.read(0, "notionalCcy"), d.read(0, "notionalAmount"), d.read(0, "strike")]).toEqual(["USD", 700, ""]);
    expect(h.hasValidationErrors()).toBe(false);
  });

  it("200 add/clone/remove cycles: unique ids, titles by position, no emits for gone products, no slow-down", async () => {
    h.deal.addGroup("VanillaGroup");
    await flush();
    const rec = recorder(h.deal);
    const ghosts = new Set<string>();
    const stop = h.deal.subscribe((change) => {
      if (change.kind !== "products") return;
      const live = new Set(d.products().map(({ productId }) => productId));
      for (const id of change.ids) if (!live.has(id)) ghosts.add(id);
    });
    /** One paste of 4 fields over the deal's products, timed. */
    const timedPaste = (round: number) => {
      const writes = ["strike", "expiryCut", "callPut", "buySell"].flatMap((fieldId) =>
        d.pathsOf(fieldId).map((path) => ({ path, value: fieldId === "callPut" ? "Call" : fieldId === "buySell" ? "Buy" : String(round % 100) })),
      );
      const started = performance.now();
      d.write(writes);
      return performance.now() - started;
    };
    const ids = new Set<string>();
    const warm = [0, 1, 2, 3, 4].map(timedPaste);
    for (let cycle = 0; cycle < 200; cycle++) {
      h.deal.addGroup(cycle % 3 === 0 ? "Strategy" : cycle % 3 === 1 ? "Average" : "VanillaGroup");
      h.deal.cloneGroup(h.deal.getGroups().at(-1)!.id);
      d.commit(d.count() - 1, "strike", String(cycle % 100));
      for (const { productId } of d.products()) ids.add(productId);
      h.deal.removeGroup(h.deal.getGroups()[1].id);
      h.deal.removeGroup(h.deal.getGroups()[1].id);
      if (cycle % 20 === 0) await flush();
    }
    await flush();
    const after = [5, 6, 7, 8, 9].map(timedPaste);
    await flush();
    stop();
    rec.stop();
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[2];
    const result = {
      groups: d.titles(),
      productsEverSeen: ids.size,
      ghostIds: ghosts.size,
      pasteMsBefore: Math.round(median(warm) * 100) / 100,
      pasteMsAfter: Math.round(median(after) * 100) / 100,
    };
    note("200 cycles", app, result);
    expect(d.titles()).toEqual(["Vanilla Group #1"]);
    expect(d.count()).toBe(1);
    expect(h.hasValidationErrors()).toBe(true); // the default notional ccy is invalid
    expect(result.ghostIds).toBe(0);
    // a leak (listeners or validation entries of gone products) shows as writes getting slower
    expect(result.pasteMsAfter).toBeLessThan(Math.max(5 * result.pasteMsBefore, 2));
  }, 60_000);

  it("after dispose: writes don't throw, and nothing autocalcs any more (compared across apps)", async () => {
    h.deal.addGroup("VanillaGroup");
    d.write([{ path: "notionalCcy", value: "USD" }]);
    page.setAutocalc(true);
    await flush();
    const before = calcControl.calls.length;
    h.dispose();
    let threw = "";
    try {
      d.commit(0, "notionalAmount", 1000);
      h.deal.addGroup("VanillaGroup");
    } catch (error) {
      threw = (error as Error).message.split("\n")[0];
    }
    await flush();
    const result = {
      threw,
      autocalcRequestsAfterDispose: calcControl.calls.length - before,
      calc: h.calc().status,
      products: (() => {
        try {
          return d.count();
        } catch (error) {
          return `read throws: ${(error as Error).message.split("\n")[0].slice(0, 60)}`;
        }
      })(),
    };
    note("dispose then write", app, result);
  });

  itFor(app, ["mobx-state-tree"])("a calculation answered after dispose is dropped quietly", async () => {
    mockCalculate("manual");
    page = await launch(app);
    [h] = page.deals;
    d = ops(h.deal);
    h.deal.addGroup("VanillaGroup");
    d.write([{ path: "notionalCcy", value: "USD" }]);
    await flush();
    h.calculate();
    expect(calcControl.calls).toHaveLength(1);
    h.dispose();
    const warnings: string[] = [];
    const errors: unknown[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args) => void warnings.push(args.join(" ").slice(0, 120)));
    const onRejection = (reason: unknown) => errors.push(reason);
    process.on("unhandledRejection", onRejection);
    calcControl.calls[0].resolve();
    await flush();
    process.off("unhandledRejection", onRejection);
    note("calc answered after dispose", app, { warnings, errors: errors.map(String) });
    expect({ warnings, errors }).toEqual({ warnings: [], errors: [] });
  });
});

describe.each(appNames)("%s: two deals on one page (tabs)", (app) => {
  let page: Page;
  let api: ControlledApi;

  beforeEach(async () => {
    api = installControlledApi({ Cash: [{ id: 4, name: "C4" }, { id: 3, name: "Shared" }] }, "auto");
    mockCalculate("auto");
    page = await launch(app, 2);
    for (const { deal } of page.deals) {
      deal.addGroup("VanillaGroup");
      deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    }
    await flush();
  });
  afterEach(() => {
    page.deals.forEach((deal) => {
      try {
        deal.dispose();
      } catch {
        // disposed by the test already (keystone's unregister isn't idempotent)
      }
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a write to one deal doesn't reach the other, its listeners, or its price", async () => {
    const [a, b] = page.deals;
    page.setAutocalc(true);
    await flush();
    const bBefore = snapshot(b.deal);
    const bCalc = b.calc();
    const changes: string[] = [];
    const stop = b.deal.subscribe((change) => changes.push(change.kind));
    const da = ops(a.deal);
    da.write([
      { path: "strike", value: "9" },
      { path: "premiumCcy", value: "EUR" },
      { path: "isInternal", value: false },
      { path: da.path(0, "notionalAmount"), value: 300 },
    ]);
    a.deal.addGroup("Average");
    a.deal.cloneGroup(a.deal.getGroups()[0].id);
    a.deal.removeGroup(a.deal.getGroups()[0].id);
    await flush();
    stop();
    const bAfter = snapshot(b.deal);
    expect(changes.filter((kind) => kind !== "options")).toEqual([]);
    expect([...bAfter.products.values()].map((p) => p.cells)).toEqual([...bBefore.products.values()].map((p) => p.cells));
    expect([bAfter.dealFields, bAfter.settings, bAfter.groups]).toEqual([bBefore.dealFields, bBefore.settings, bBefore.groups]);
    expect(b.calc()).toEqual(bCalc);
    expect(ops(a.deal).readAll("notionalAmount")).toEqual([300, 300]);
  });

  it("one deal's options reload, after the list changed on the server, and the other deal's product (compared across apps)", async () => {
    const [a, b] = page.deals;
    const [da, db] = [ops(a.deal), ops(b.deal)];
    for (const deal of [da, db]) deal.commit(0, "settlementStyle", "Cash");
    await flush();
    for (const deal of [da, db]) deal.commit(0, "settlementFixingSource", "3");
    await flush();
    b.calculate();
    await flush();
    expect(b.calc().status).toBe("done");
    api.lists.Cash = [{ id: 4, name: "C4" }]; // 3 is no longer offered
    da.commit(0, "settlementStyle", "Delivery");
    da.commit(0, "settlementStyle", "Cash"); // deal A reloads Cash's options
    await flush();
    const result = {
      a: da.read(0, "settlementFixingSource"),
      b: db.read(0, "settlementFixingSource"),
      bOptions: (b.deal.getOptions()["fixingSources:Cash"]?.options ?? []).map((option) => option.value),
      bPrice: b.calc().status,
    };
    note("options cross-talk between deals", app, result);
    expect(result.a).toBe("4");
  });

  it("one deal's options load keeps the other deal from calculating meanwhile (compared across apps)", async () => {
    api.mode = "manual";
    const [a, b] = page.deals;
    ops(a.deal).commit(0, "settlementStyle", "Cash"); // deal A loads; deal B has nothing pending of its own
    await flush();
    b.calculate();
    await flush();
    note("another deal's pending load blocks Calculate", app, b.calc().status);
    api.respondAll();
    await flush();
  });
});

describe("lifecycle: do the apps agree?", () => {
  afterAll(() => saveResults("lifecycle", seen));
  const agree = (key: string) => {
    const values = Object.entries(seen[key] ?? {}).map(([, value]) => exactJson(value));
    expect(Object.keys(seen[key] ?? {})).toHaveLength(appNames.length);
    expect(new Set(values).size, JSON.stringify(seen[key], null, 1)).toBe(1);
  };
  const strict = process.env.STRICT === "1";
  it("another deal's pending load blocks Calculate", () => agree("another deal's pending load blocks Calculate"));
  // verified divergences
  (strict ? it : it.fails)("dispose then write", () => agree("dispose then write"));
  (strict ? it : it.fails)("options cross-talk between deals", () => agree("options cross-talk between deals"));
});
