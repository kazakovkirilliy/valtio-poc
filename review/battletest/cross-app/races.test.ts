import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AppName,
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
  recorder,
  saveResults,
} from "./support/harness.ts";

/**
 * Async races, with the fixing-sources API and the pricing request answered
 * by hand (`installControlledApi`, `mockCalculate`): what each app does when
 * responses arrive late, fail, or arrive after what asked for them is gone.
 */

const lists = () => ({ Cash: [{ id: 4, name: "C4" }, { id: 3, name: "Shared" }] });

/** Observations shared across apps, compared in the last describe. */
const seen: Record<string, Partial<Record<AppName, unknown>>> = {};
const note = (key: string, app: AppName, value: unknown) => {
  if (!seen[key]) seen[key] = {};
  seen[key][app] = value;
};

describe.each(appNames)("%s: async races", (app) => {
  let page: Page;
  let h: DealHandle;
  let api: ControlledApi;
  let d: ReturnType<typeof ops>;

  /** Answers every options request, then lets the app settle. */
  const settleOptions = async () => {
    await flush();
    api.respondAll();
    await flush();
  };

  /** A valid one-product deal (Vanilla Group, USD), everything loaded. */
  const validDeal = async () => {
    h.deal.addGroup("VanillaGroup");
    d.write([{ path: "notionalCcy", value: "USD" }]);
    await settleOptions();
    expect(h.hasValidationErrors()).toBe(false);
  };

  beforeEach(async () => {
    api = installControlledApi(lists());
    mockCalculate("manual");
    page = await launch(app);
    [h] = page.deals;
    d = ops(h.deal);
  });
  afterEach(() => {
    h.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Cash → Delivery → Cash while Cash's options load: one request, the first option, nothing left pending", async () => {
    await validDeal();
    const before = api.requests.length;
    d.commit(0, "settlementStyle", "Cash");
    d.commit(0, "settlementStyle", "Delivery");
    d.commit(0, "settlementStyle", "Cash");
    await flush();
    expect(api.requests.length - before).toBe(1); // concurrent loads of one style share a request
    api.respondAll();
    await flush();
    expect(d.read(0, "settlementFixingSource")).toBe("4");
    expect(h.hasValidationErrors()).toBe(false);
    h.calculate();
    expect(h.calc().status).toBe("calculating"); // ready: no load counted as pending any more
  });

  it("removing a group while its options load: the late response touches nothing and leaves nothing pending", async () => {
    await validDeal();
    h.deal.addGroup("Strategy");
    await settleOptions();
    const rec = recorder(h.deal);
    d.commit(1, "settlementStyle", "Cash");
    await flush();
    const removed = h.deal.getGroups()[1].id;
    h.deal.removeGroup(removed);
    const report = await rec.measure(() => api.respondAll());
    rec.stop();
    expect(report.ghosts).toEqual([]);
    expect(d.count()).toBe(1);
    expect(d.has(0, "settlementFixingSource")).toBe(false);
    h.calculate();
    expect(h.calc().status).toBe("calculating");
  });

  it("removing a group while a calculation is in flight: the response is dropped, the price outdated", async () => {
    await validDeal();
    h.deal.addGroup("VanillaGroup");
    await settleOptions();
    h.calculate();
    expect(calcControl.calls).toHaveLength(1);
    h.deal.removeGroup(h.deal.getGroups()[1].id);
    await flush();
    expect(h.calc()).toEqual({ status: "outdated", price: null });
    calcControl.calls[0].resolve();
    await flush();
    expect(h.calc()).toEqual({ status: "outdated", price: null });
  });

  it("cloning a group whose options are pending: both copies get the first option once they arrive", async () => {
    await validDeal();
    d.commit(0, "settlementStyle", "Cash");
    await flush();
    h.deal.cloneGroup(h.deal.getGroups()[0].id);
    await flush();
    expect(d.readAll("settlementStyle")).toEqual(["Cash", "Cash"]);
    expect([d.has(0, "settlementFixingSource"), d.has(1, "settlementFixingSource")]).toEqual([false, false]);
    api.respondAll();
    await flush();
    expect(d.readAll("settlementFixingSource")).toEqual(["4", "4"]);
    expect(h.hasValidationErrors()).toBe(false);
    h.calculate();
    expect(h.calc().status).toBe("calculating");
  });

  it("a failed load, then a retry: nothing stays pending, and the retry fills the field", async () => {
    h.deal.addGroup("VanillaGroup");
    d.write([{ path: "notionalCcy", value: "USD" }]);
    await flush();
    api.pending.forEach((request) => request.fail()); // the deal column's own load
    await flush();
    expect(page.options()["fixingSources:Cash"]?.status).toBe("error");
    d.commit(0, "settlementStyle", "Cash");
    await flush();
    api.pending.forEach((request) => request.fail());
    await flush();
    expect(d.has(0, "settlementFixingSource")).toBe(false);
    note("a failed Cash load: the product's issues", app, d.issues(0, "settlementFixingSource"));
    d.commit(0, "settlementStyle", "Delivery");
    await flush();
    expect(h.hasValidationErrors()).toBe(false);
    h.calculate();
    expect(h.calc().status).toBe("calculating"); // the failures left nothing pending
    d.commit(0, "settlementStyle", "Cash"); // retry
    await flush();
    api.respondAll();
    await flush();
    expect(page.options()["fixingSources:Cash"]?.status).toBe("loaded");
    expect(d.read(0, "settlementFixingSource")).toBe("4");
    expect(h.hasValidationErrors()).toBe(false);
  });

  it("toggling autocalc while a calculation is in flight starts nothing more; turning it on later catches up", async () => {
    await validDeal();
    page.setAutocalc(true);
    await flush();
    expect(calcControl.calls).toHaveLength(1);
    page.setAutocalc(false);
    page.setAutocalc(true);
    page.setAutocalc(false);
    await flush();
    expect(calcControl.calls).toHaveLength(1);
    calcControl.calls[0].resolve();
    await flush();
    expect(h.calc()).toEqual({ status: "done", price: 1 });
    d.commit(0, "notionalAmount", 1000);
    await flush();
    expect(h.calc()).toEqual({ status: "outdated", price: 1 });
    page.setAutocalc(true);
    await flush();
    expect(calcControl.calls).toHaveLength(2);
    calcControl.calls[1].resolve();
    await flush();
    expect(h.calc()).toEqual({ status: "done", price: 2 });
  });

  it("an edit while autocalc's calculation is in flight supersedes it: the late first response is dropped", async () => {
    await validDeal();
    page.setAutocalc(true);
    await flush();
    d.commit(0, "notionalAmount", 1000);
    await flush();
    expect(calcControl.calls).toHaveLength(2);
    calcControl.calls[1].resolve();
    await flush();
    calcControl.calls[0].resolve();
    await flush();
    expect(h.calc()).toEqual({ status: "done", price: 2 });
  });

  it("Calculate pressed twice: two requests, only the second one's price counts, whatever the order", async () => {
    await validDeal();
    h.calculate();
    h.calculate();
    await flush();
    note("Calculate twice: requests", app, calcControl.calls.length);
    expect(calcControl.calls).toHaveLength(2);
    calcControl.calls[1].resolve(7);
    await flush();
    calcControl.calls[0].resolve(5);
    await flush();
    expect(h.calc()).toEqual({ status: "done", price: 7 });
  });

  it("a calculation answered after every group is removed: dropped; with autocalc on, the empty deal is priced", async () => {
    await validDeal();
    h.calculate();
    h.deal.removeGroup(h.deal.getGroups()[0].id);
    await flush();
    calcControl.calls[0].resolve();
    await flush();
    expect(h.calc()).toEqual({ status: "outdated", price: null });
    page.setAutocalc(true);
    await flush();
    calcControl.resolveAll();
    await flush();
    note("autocalc on an empty deal", app, { calc: h.calc(), requests: calcControl.calls.map((call) => call.productCount) });
  });

  it("a superseded calculation that fails changes nothing; the current one's failure shows, and a late success can't undo it", async () => {
    await validDeal();
    page.setAutocalc(true);
    await flush();
    d.commit(0, "notionalAmount", 1000);
    await flush();
    expect(calcControl.calls).toHaveLength(2);
    calcControl.calls[0].reject();
    await flush();
    expect(h.calc().status).toBe("calculating");
    calcControl.calls[1].reject();
    await flush();
    expect(h.calc()).toEqual({ status: "error", price: null });
    expect(calcControl.calls).toHaveLength(2); // an error isn't retried by autocalc
  });

  it(
    "options reloaded with nothing to change (a same-style broadcast) leave a done price done",
    async () => {
      await validDeal();
      d.commit(0, "settlementStyle", "Cash");
      await settleOptions();
      h.calculate();
      calcControl.resolveAll();
      await flush();
      expect(h.calc()).toEqual({ status: "done", price: 1 });
      const requests = api.requests.length;
      d.write([{ path: "settlementStyle", value: "Cash" }]); // every product is Cash already: no value changes
      await flush();
      expect(api.requests.length).toBe(requests + 1); // but Cash's options reload
      api.respondAll();
      await flush();
      expect(h.calc()).toEqual({ status: "done", price: 1 });
    },
  );

  itFor(app, ["mobx"])("an edit that starts a load, with autocalc on: priced once, after the options arrive", async () => {
    await validDeal();
    page.setAutocalc(true);
    await flush();
    calcControl.resolveAll();
    await flush();
    const before = calcControl.calls.length;
    d.commit(0, "settlementStyle", "Cash");
    await flush();
    expect(calcControl.calls.length).toBe(before); // waits for the options (and the fixing source is missing)
    api.respondAll();
    await flush();
    expect(calcControl.calls.length).toBe(before + 1);
    calcControl.resolveAll();
    await flush();
    expect(h.calc().status).toBe("done");
  });

  itFor(app, ["valtio", "mobx", "mobx-state-tree", "mobx-keystone", "legend-state"])(
    "a clone whose value is no longer offered: reconciled before it's priced, so priced once",
    async () => {
    await validDeal();
    page.setAutocalc(true);
    api.lists.Cash = [{ id: 3, name: "Shared" }, { id: 4, name: "C4" }];
    d.commit(0, "settlementStyle", "Cash");
    await settleOptions();
    calcControl.resolveAll();
    await flush();
    expect(d.read(0, "settlementFixingSource")).toBe("3");
    api.lists.Cash = [{ id: 4, name: "C4" }]; // 3 is no longer offered
    const before = calcControl.calls.length;
    h.deal.cloneGroup(h.deal.getGroups()[0].id);
    await flush();
    api.respondAll();
    await flush();
    calcControl.resolveAll();
    await flush();
    note("clone + reconcile: price requests", app, calcControl.calls.length - before);
    expect(d.readAll("settlementFixingSource")).toEqual(["4", "4"]);
    expect(h.calc().status).toBe("done");
    expect(calcControl.calls.length - before).toBe(1);
    },
  );

  itFor(app, ["mobx-keystone", "effector-model"])(
    "removing the only invalid group, ahead of two others, with autocalc on: priced once",
    async () => {
      await validDeal();
      h.deal.addGroup("VanillaGroup");
      h.deal.addGroup("VanillaGroup");
      d.commit(0, "strike", "1234"); // the first group's product is invalid: the deal isn't ready
      page.setAutocalc(true);
      await settleOptions();
      expect(h.hasValidationErrors()).toBe(true);
      const before = calcControl.calls.length;
      h.deal.removeGroup(h.deal.getGroups()[0].id); // the others are renumbered
      await flush();
      note("removing the invalid group: price requests", app, calcControl.calls.length - before);
      expect(d.titles()).toEqual(["Vanilla Group #1", "Vanilla Group #2"]);
      expect(calcControl.calls.length - before).toBe(1);
    },
  );

  itFor(app, ["mobx-keystone"])("fixing an invalid edit with autocalc on: priced once", async () => {
    await validDeal();
    page.setAutocalc(true);
    await flush();
    calcControl.resolveAll();
    await flush();
    d.commit(0, "strike", "1234"); // invalid: outdated, not priced
    await flush();
    const before = calcControl.calls.length;
    expect(h.calc().status).toBe("outdated");
    d.commit(0, "strike", "1"); // valid again: one request
    await flush();
    note("fixing an invalid edit: price requests", app, calcControl.calls.length - before);
    expect(calcControl.calls.length - before).toBe(1);
    calcControl.resolveAll();
    await flush();
    expect(h.calc()).toEqual({ status: "done", price: 1 });
  });
});

describe("races: do the apps agree?", () => {
  afterAll(() => saveResults("races", seen));
  const agreeing = ["a failed Cash load: the product's issues", "Calculate twice: requests", "autocalc on an empty deal"];
  // verified divergences (see the per-app tests above)
  const diverging = ["clone + reconcile: price requests", "fixing an invalid edit: price requests", "removing the invalid group: price requests"];
  const check = (key: string) => {
      const values = Object.values(seen[key] ?? {}).map((value) => JSON.stringify(value));
      expect(Object.keys(seen[key] ?? {})).toHaveLength(appNames.length);
      expect(new Set(values).size, JSON.stringify(seen[key])).toBe(1);
  };
  it.each(agreeing)("%s", check);
  (process.env.STRICT === "1" ? it.each(diverging) : it.fails.each(diverging))("%s", check);
});
