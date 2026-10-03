import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DealAdapter, appNames, createAdapter } from "./support/adapters.ts";
import { type FakeApi, installFakeApi, sleep } from "./support/fakeApi.ts";

// a different list per style: Cash's first option is 4, and 3 is in both
const lists = {
  Delivery: [{ id: 1, name: "D1" }, { id: 2, name: "D2" }, { id: 3, name: "Shared" }],
  Cash: [{ id: 4, name: "C4" }, { id: 3, name: "Shared" }],
};

describe.each(appNames)("%s fixing sources", (app) => {
  let deal: DealAdapter;
  let api: FakeApi;

  beforeEach(async () => {
    api = installFakeApi(structuredClone(lists));
    deal = await createAdapter(app);
    deal.addGroup("Strategy");
  });
  afterEach(() => {
    deal.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const fixings = () => Array.from({ length: deal.productCount() }, (_, i) => deal.read(i, "settlementFixingSource"));
  const styles = () => Array.from({ length: deal.productCount() }, (_, i) => deal.read(i, "settlementStyle"));

  const hasFixing = () => Array.from({ length: deal.productCount() }, (_, i) => deal.has(i, "settlementFixingSource"));

  it("has no fixing source unless Cash: a new (Delivery) product neither stores nor loads one", async () => {
    expect(styles()).toEqual(["Delivery", "Delivery"]);
    expect(api.requests).toEqual(["Cash"]); // the deal column's options only
    await sleep(30);
    expect(hasFixing()).toEqual([false, false]);
    expect(deal.optionsFor("Delivery").status).toBeUndefined();
    expect(deal.optionsFor("Cash")).toEqual({ status: "loaded", values: ["4", "3"], labels: ["C4", "Shared"] });
  });

  it("adds the fixing source on Cash (the first option) and removes it on leaving Cash", async () => {
    await sleep(30);
    deal.commit(0, "settlementStyle", "Cash");
    expect(api.requests).toEqual(["Cash", "Cash"]); // every change reloads
    await sleep(30);
    expect(fixings()).toEqual(["4", undefined]);
    expect(hasFixing()).toEqual([true, false]);
    deal.commit(0, "settlementFixingSource", "3");
    deal.commit(0, "settlementStyle", "Delivery");
    expect(hasFixing()).toEqual([false, false]); // removed at once, not just emptied
    expect(deal.issues(0, "settlementFixingSource")).toEqual([]);
    await sleep(30);
    expect(api.requests).toEqual(["Cash", "Cash"]); // Delivery has nothing to load
  });

  it("broadcasts a style with one request, keeping a value that is still an option", async () => {
    deal.addGroup("VanillaGroup");
    await sleep(30);
    deal.commit(0, "settlementStyle", "Cash");
    await sleep(30);
    deal.commit(0, "settlementFixingSource", "3");
    const before = api.requests.length;
    deal.broadcast("settlementStyle", "Cash");
    expect(styles()).toEqual(["Cash", "Cash", "Cash"]);
    await sleep(30);
    expect(api.requests).toHaveLength(before + 1);
    expect(fixings()).toEqual(["3", "4", "4"]);
  });

  it("ignores a response for a style the product has already left", async () => {
    await sleep(30);
    api.delays.Cash = 80;
    deal.commit(0, "settlementStyle", "Cash"); // slow
    deal.commit(0, "settlementStyle", "Delivery");
    await sleep(120);
    expect(styles()[0]).toBe("Delivery");
    expect(hasFixing()[0]).toBe(false); // the late Cash response would have added it
  });

  it("broadcasts a fixing source only to Cash products", async () => {
    await sleep(30);
    deal.commit(0, "settlementStyle", "Cash");
    await sleep(30);
    deal.broadcast("settlementFixingSource", "3");
    expect(fixings()).toEqual(["3", undefined]);
    expect(hasFixing()).toEqual([true, false]);
  });

  it("leaves values alone when a request fails", async () => {
    await sleep(30);
    deal.commit(0, "settlementStyle", "Cash");
    await sleep(30);
    deal.commit(0, "settlementFixingSource", "3");
    api.failing.add("Cash");
    deal.commit(1, "settlementStyle", "Cash");
    await sleep(30);
    expect(deal.optionsFor("Cash").status).toBe("loaded"); // the list already shown is kept
    expect(fixings()).toEqual(["3", undefined]); // nothing loaded to pick from
  });
});
