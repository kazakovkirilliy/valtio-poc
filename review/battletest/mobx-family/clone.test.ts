import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppName, type DealAdapter, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";

/**
 * Clone independence, harder than the shared test: nested objects, derived
 * fields, async fields, undeclared paths, the source removed afterwards, and
 * a clone made while its options are still loading.
 */
describe.each(["mobx", "mobx-state-tree", "mobx-keystone"] as const satisfies readonly AppName[])("%s clone", (app) => {
  let deal: DealAdapter;
  beforeEach(async () => {
    vi.resetModules();
    installFakeApi({ Cash: [{ id: 4, name: "C4" }, { id: 3, name: "C3" }] });
    deal = await createAdapter(app);
  });
  afterEach(() => {
    deal.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("copies every leaf, nested and derived ones included, and shares nothing", async () => {
    deal.addGroup("Strategy");
    deal.commit(0, "settlementStyle", "Cash");
    deal.commit(0, "settlementCcy", "EUR");
    deal.commit(0, "expiryDate", "2999-01-01");
    await sleep(20);
    deal.commit(0, "settlementFixingSource", "3");
    // a path that isn't a declared field, written as is
    const [group] = deal.deal().getGroups();
    deal.deal().writePaths([{ path: `groups.${group.id}.products.${group.productIds[0]}.data.extra.note`, value: "x" }]);
    deal.cloneGroup(0);
    await sleep(20);
    expect(deal.productIdsOfGroup(1)).not.toContain(deal.productIdsOfGroup(0)[0]);
    // the copy has everything …
    expect(deal.read(2, "settlementCcy")).toBe("EUR");
    expect(deal.read(2, "settlementFixingSource")).toBe("3");
    expect(deal.read(2, "expiryDays")).toBe(deal.read(0, "expiryDays"));
    expect(deal.deal().readPath(`groups.${deal.deal().getGroups()[1].id}.products.${deal.productIdsOfGroup(1)[0]}.data.extra.note`)).toBe("x");
    // … and its own: writes either way stay put, derived fields follow their own product
    deal.commit(2, "settlementCcy", "GBP");
    deal.commit(0, "strike", "1");
    deal.commit(2, "expiryDate", "2999-06-01");
    expect(deal.read(0, "settlementCcy")).toBe("EUR");
    expect(deal.read(2, "strike")).toBe("");
    expect(deal.read(0, "expiryDays")).not.toBe(deal.read(2, "expiryDays"));
    // the source goes; the copy keeps working
    deal.removeGroup(0);
    deal.commit(0, "strike", "2");
    expect(deal.read(0, "strike")).toBe("2");
    expect(deal.read(0, "settlementCcy")).toBe("GBP");
    expect(deal.issues(0, "strike")).toEqual([]);
    deal.commit(0, "strike", "2345");
    expect(deal.issues(0, "strike")).toHaveLength(1);
  });

  it("a clone made while Cash options load gets them too", async () => {
    deal.addGroup("VanillaGroup");
    deal.commit(0, "settlementStyle", "Cash");
    deal.cloneGroup(0); // options for Cash still in flight
    expect(deal.has(1, "settlementFixingSource")).toBe(false); // added once the options arrive (O2)
    await sleep(30);
    expect([deal.read(0, "settlementFixingSource"), deal.read(1, "settlementFixingSource")]).toEqual(["4", "4"]);
  });
});
