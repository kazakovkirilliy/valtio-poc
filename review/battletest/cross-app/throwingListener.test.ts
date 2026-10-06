import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  type AppName,
  appNames,
  calcControl,
  exactJson,
  flush,
  installControlledApi,
  itFor,
  launch,
  mockCalculate,
  ops,
  saveResults,
} from "./support/harness.ts";

/**
 * A listener of the deal that throws (a buggy grid, a devtools hook). What
 * reaches the writer, what the other listeners hear, whether the price
 * follows, and whether the page still works afterwards.
 *
 * One test per app, on purpose: Legend-State's batch state is module-global
 * (node_modules isn't reset between tests), and a throw leaves it stuck for
 * the rest of the file.
 */

const seen: Record<string, Partial<Record<AppName, unknown>>> = {};

describe.each(appNames)("%s: a listener that throws", (app) => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  itFor(app, ["legend-state", "redux", "zustand"])("the write lands, the price follows, and the page keeps notifying afterwards", async () => {
    installControlledApi({ Cash: [{ id: 4, name: "C4" }] }, "auto");
    mockCalculate("auto");
    const page = await launch(app);
    const [h] = page.deals;
    const d = ops(h.deal);
    h.deal.addGroup("Strategy");
    d.write([{ path: "notionalCcy", value: "USD" }]);
    page.setAutocalc(true);
    await flush();

    // 1. a listener throws while the write notifies (only while the write is on the stack: an app that notifies later never sees it throw)
    let writing = false;
    const othersHeard: string[] = [];
    const stopBad = h.deal.subscribe(() => {
      if (writing) throw new Error("listener failed");
    });
    const stopOther = h.deal.subscribe((change) => othersHeard.push(change.kind));
    let threw = "";
    const pricesBefore = calcControl.calls.length;
    writing = true;
    try {
      d.commit(0, "notionalAmount", 1000);
    } catch (error) {
      threw = (error as Error).message;
    }
    writing = false;
    await flush();
    stopBad();
    stopOther();
    const during = {
      threwToTheWriter: threw,
      written: d.readAll("notionalAmount"),
      laterListenerHeardIt: othersHeard.includes("products"),
      calc: h.calc(),
      priceRequests: calcControl.calls.length - pricesBefore,
    };

    // 2. afterwards, with only well-behaved listeners
    const heard: string[] = [];
    const stop = h.deal.subscribe((change) => heard.push(change.kind));
    const pricesAfter = calcControl.calls.length;
    d.commit(0, "notionalAmount", 2000);
    h.deal.addGroup("VanillaGroup");
    await flush();
    stop();
    const after = { heard: [...new Set(heard)].sort(), calc: h.calc(), priceRequests: calcControl.calls.length - pricesAfter };

    // 3. a brand-new deal on a fresh page (same library instance)
    const fresh = (await launch(app)).deals[0];
    const freshHeard: string[] = [];
    const stopFresh = fresh.deal.subscribe((change) => freshHeard.push(change.kind));
    fresh.deal.addGroup("VanillaGroup");
    await flush();
    stopFresh();

    const result = { during, after, freshDealHeard: [...new Set(freshHeard)].sort() };
    if (!seen.result) seen.result = {};
    seen.result[app] = result;
    h.dispose();
    fresh.dispose();

    expect(during.written).toEqual([1000, 1000]);
    // the store's own reactions don't depend on a third-party listener: repriced, (1 + 1000/1000) × 2
    expect(during.calc).toEqual({ status: "done", price: 4 });
    expect(after.heard).toEqual(["dealFields", "groups", "products"]);
    expect(after.calc).toEqual({ status: "done", price: 9 }); // (1 + 2) × 3 products, recalculated
    expect(result.freshDealHeard).toContain("groups");
  });
});

describe("a listener that throws: what each app does", () => {
  afterAll(() => saveResults("throwingListener", seen));
  // verified divergence: some apps rethrow to the writer, the rest swallow; none isolates the other listeners
  (process.env.STRICT === "1" ? it : it.fails)("the apps agree on what reaches the writer and the other listeners", () => {
    const values = Object.values(seen.result ?? {}).map((value) => exactJson((value as { during: unknown }).during));
    expect(new Set(values).size, JSON.stringify(seen.result, null, 1)).toBe(1);
  });
  it("no app lets a later listener hear a change an earlier one threw on (shared createChangeHub)", () => {
    const heardBy = Object.entries(seen.result ?? {}).filter(([, value]) => (value as { during: { laterListenerHeardIt: boolean; threwToTheWriter: string } }).during.laterListenerHeardIt);
    // valtio notifies a tick later, so its listener never threw: the only one that "heard"
    expect(heardBy.map(([app]) => app)).toEqual(["valtio"]);
  });
});
