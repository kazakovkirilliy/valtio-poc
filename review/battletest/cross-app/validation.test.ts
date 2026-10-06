import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ControlledApi,
  type DealHandle,
  type Page,
  appNames,
  calcControl,
  flush,
  installControlledApi,
  itFor,
  launch,
  mockCalculate,
  ops,
} from "./support/harness.ts";

/** Issues stay right through clones, removals, reconciles, broadcasts and visibility changes. */

const RULE = "Delivery date can't be before expiry date";

describe.each(appNames)("%s: validation", (app) => {
  let page: Page;
  let h: DealHandle;
  let api: ControlledApi;
  let d: ReturnType<typeof ops>;

  beforeEach(async () => {
    api = installControlledApi({ Cash: [{ id: 4, name: "C4" }, { id: 3, name: "Shared" }] }, "auto");
    mockCalculate("manual");
    page = await launch(app);
    [h] = page.deals;
    d = ops(h.deal);
    h.deal.addGroup("Strategy");
    h.deal.addGroup("Average");
    d.write([{ path: "notionalCcy", value: "USD" }]);
    await flush();
    expect(h.hasValidationErrors()).toBe(false);
  });
  afterEach(() => {
    h.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a clone keeps its source's issues; fixing the clone leaves the source flagged; removing the source leaves the clone's", async () => {
    d.commit(1, "strike", "1234");
    d.commit(1, "expiryDate", "2999-02-10");
    d.commit(1, "deliveryDate", "2999-02-01");
    h.deal.cloneGroup(h.deal.getGroups()[0].id); // products 2, 3 copy 0, 1
    await flush();
    expect([d.issues(3, "strike"), d.issues(3, "deliveryDate")]).toEqual([["Must be at most 3 characters"], [RULE]]);
    d.commit(3, "strike", "1");
    d.commit(3, "expiryDate", "2999-01-01"); // the rule's other field
    await flush();
    expect([d.issues(3, "strike"), d.issues(3, "deliveryDate")]).toEqual([[], []]);
    expect([d.issues(1, "strike"), d.issues(1, "deliveryDate")]).toEqual([["Must be at most 3 characters"], [RULE]]);
    d.commit(2, "callPut", "Nope"); // an issue on the clone only
    h.deal.removeGroup(h.deal.getGroups()[0].id); // the source, with its issues
    await flush();
    expect(h.hasValidationErrors()).toBe(true);
    expect(d.issues(0, "callPut")).toHaveLength(1);
    d.commit(0, "callPut", "Put");
    await flush();
    expect(h.hasValidationErrors()).toBe(false);
  });

  it("the Delivery-before-Expiry rule, from broadcasts and product writes in one batch, in either order", async () => {
    const flagged = () => d.products().map((_, i) => d.issues(i, "deliveryDate").includes(RULE));
    d.write([
      { path: "expiryDate", value: "2999-06-01" },
      { path: d.path(0, "deliveryDate"), value: "2999-05-01" },
    ]);
    await flush();
    expect(flagged()).toEqual([true, false, false]);
    d.write([
      { path: d.path(2, "deliveryDate"), value: "2999-05-01" },
      { path: "expiryDate", value: "2999-07-01" },
    ]);
    await flush();
    expect(flagged()).toEqual([true, false, true]);
    d.write([{ path: "deliveryDate", value: "2999-08-01" }]); // a broadcast fixes every product
    await flush();
    expect(flagged()).toEqual([false, false, false]);
    d.commit(1, "expiryDays", 365 * 2000); // the derived field moves the date past delivery
    await flush();
    expect(flagged()).toEqual([false, true, false]);
    expect(h.hasValidationErrors()).toBe(true);
  });

  it("a hidden field: kept but not validated, flagged once shown by a broadcast, cleared when hidden again", async () => {
    d.commit(0, "settlementCcy", "TOOLONG1");
    d.commit(2, "settlementCcy", "TOOLONG2");
    await flush();
    expect(h.hasValidationErrors()).toBe(false);
    d.write([{ path: "settlementStyle", value: "Cash" }]);
    await flush();
    const ccyIssues = () => d.products().map((_, i) => d.issues(i, "settlementCcy").length);
    expect(ccyIssues()).toEqual([1, 0, 1]);
    expect(h.hasValidationErrors()).toBe(true);
    expect(h.deal.fieldIssues(d.products()[1].productId, "settlementFixingSource")).toEqual([]); // loaded meanwhile
    d.write([{ path: "settlementStyle", value: "Delivery" }]);
    await flush();
    expect(ccyIssues()).toEqual([0, 0, 0]);
    expect(d.readAll("settlementCcy")).toEqual(["TOOLONG1", "", "TOOLONG2"]);
    expect(h.hasValidationErrors()).toBe(false);
  });

  it("a Cash product is flagged until its fixing source arrives; the reconcile clears it", async () => {
    api.mode = "manual";
    d.commit(0, "settlementStyle", "Cash");
    await flush();
    expect(d.issues(0, "settlementFixingSource")).toHaveLength(1); // absent while loading
    expect(h.hasValidationErrors()).toBe(true);
    api.respondAll();
    await flush();
    expect(d.issues(0, "settlementFixingSource")).toEqual([]);
    expect(h.hasValidationErrors()).toBe(false);
  });

  it("a clone's derived field follows its own date: writing Expiry Days on the clone moves only its date", async () => {
    d.commit(0, "expiryDate", "2999-01-01");
    h.deal.cloneGroup(h.deal.getGroups()[0].id);
    await flush();
    const sourceDays = d.read(0, "expiryDays");
    d.commit(2, "expiryDays", 3);
    await flush();
    expect(d.read(2, "expiryDays")).toBe(3);
    expect(d.read(0, "expiryDays")).toBe(sourceDays);
    expect(d.read(0, "expiryDate")).toBe("2999-01-01");
  });

  itFor(app, ["valtio"])(
    "a container write (an object at a parent path) is validated: an invalid amount blocks Calculate",
    async () => {
      const notional = d.path(0, "notionalCcy").replace(/\.notionalCcy$/, "");
      d.write([{ path: notional, value: { notionalCcy: "USD", amount: -5 } }]);
      await flush();
      expect(d.read(0, "notionalAmount")).toBe(-5);
      expect(d.issues(0, "notionalAmount")).toEqual(["Must be greater than 0"]);
      expect(h.hasValidationErrors()).toBe(true);
      h.calculate();
      expect(calcControl.calls).toHaveLength(0);
    },
  );

  itFor(app, ["valtio"])("after a container write, later leaf edits of that product are validated again", async () => {
    const notional = d.path(0, "notionalCcy").replace(/\.notionalCcy$/, "");
    d.write([{ path: notional, value: { notionalCcy: "USD", amount: 5 } }]);
    await flush();
    d.commit(0, "notionalAmount", -1); // synced: every product gets -1
    await flush();
    expect(d.products().map((_, i) => d.issues(i, "notionalAmount"))).toEqual([
      ["Must be greater than 0"],
      ["Must be greater than 0"],
      ["Must be greater than 0"],
    ]);
  });

  itFor(app, ["valtio", "mobx"])("after a container write of a product's base, Expiry Days still follows Expiry Date", async () => {
    const basePath = d.path(0, "expiryDate").replace(/\.expiryDate$/, "");
    const base = JSON.parse(JSON.stringify(h.deal.readPath(basePath), (_key, value) => (Number.isNaN(value) ? null : value)));
    base.expiryDays = NaN;
    base.notional.amount = NaN;
    d.write([{ path: basePath, value: base }]);
    await flush();
    d.commit(0, "expiryDate", "2999-01-01");
    await flush();
    expect(d.read(0, "expiryDays")).toBeGreaterThan(0);
    d.commit(0, "expiryDate", "2000-01-01");
    await flush();
    expect(d.issues(0, "expiryDays")).toEqual(["Expiry date is in the past"]);
  });
});
