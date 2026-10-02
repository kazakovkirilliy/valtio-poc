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

  it("loads the options for a new product's style (Delivery), sharing one request", async () => {
    expect(styles()).toEqual(["Delivery", "Delivery"]);
    expect(api.requests).toEqual(["Delivery"]);
    expect(deal.optionsFor("Delivery").status).toBe("loading");
    await sleep(30);
    expect(fixings()).toEqual(["1", "1"]); // first option
    expect(deal.optionsFor("Delivery")).toEqual({ status: "loaded", values: ["1", "2", "3"], labels: ["D1", "D2", "Shared"] });
  });

  it("reloads on a style change: keeps a value that is still an option, else resets to the first", async () => {
    await sleep(30);
    deal.commit(0, "settlementFixingSource", "3"); // in both lists
    deal.commit(0, "settlementStyle", "Cash");
    expect(api.requests.at(-1)).toBe("Cash");
    await sleep(30);
    expect(fixings()).toEqual(["3", "1"]); // kept; the other product untouched
    deal.commit(1, "settlementStyle", "Cash");
    await sleep(30);
    expect(fixings()).toEqual(["3", "4"]); // 1 isn't a Cash option: first one
    expect(api.requests.filter((style) => style === "Cash")).toHaveLength(2); // every change reloads
  });

  it("ignores a response for a style the product has already left", async () => {
    await sleep(30);
    deal.commit(0, "settlementFixingSource", "2"); // only a Delivery option
    api.delays.Cash = 80;
    deal.commit(0, "settlementStyle", "Cash"); // slow
    deal.commit(0, "settlementStyle", "Delivery"); // fast
    await sleep(120);
    expect(styles()[0]).toBe("Delivery");
    expect(fixings()[0]).toBe("2"); // the late Cash response would have reset it to 4
  });

  it("broadcasts a style to every product with one request, reconciling each", async () => {
    deal.addGroup("VanillaGroup");
    await sleep(30);
    deal.commit(0, "settlementFixingSource", "3");
    const before = api.requests.length;
    deal.broadcast("settlementStyle", "Cash");
    expect(styles()).toEqual(["Cash", "Cash", "Cash"]);
    await sleep(30);
    expect(api.requests).toHaveLength(before + 1);
    expect(fixings()).toEqual(["3", "4", "4"]);
  });

  it("leaves values alone when a request fails", async () => {
    await sleep(30);
    api.failing.add("Cash");
    deal.commit(0, "settlementStyle", "Cash");
    await sleep(30);
    expect(deal.optionsFor("Cash").status).toBe("error");
    expect(fixings()).toEqual(["1", "1"]);
  });
});
