import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
  type AppName,
  type ControlledApi,
  type DealHandle,
  appNames,
  flush,
  installControlledApi,
  itFor,
  launch,
  mockCalculate,
  ops,
  recorder,
} from "./support/harness.ts";

/**
 * The `PathDeal.subscribe` contract, batch by batch (REQUIREMENTS E7: one
 * batch, one update; only touched cells repaint). Each batch is measured
 * against before/after snapshots of everything the grid can show:
 * - stale: a product whose cells changed with no `products` emit naming it,
 *   or an emit naming a product no longer in the deal;
 * - noisy: a product named twice in one batch, or named although nothing of
 *   it changed (the grid's notifier filters these, so it is a cost, not a bug).
 */

type Ops = ReturnType<typeof ops>;
type Scenario = {
  setup?: (d: Ops, h: DealHandle, api: ControlledApi) => void | Promise<void>;
  batch: (d: Ops, h: DealHandle, api: ControlledApi) => void | Promise<void>;
  /** Apps that fail the stale check (verified findings; STRICT=1 shows them failing). */
  stale?: AppName[];
  /** Apps that fail the noise check. */
  noisy?: AppName[];
};

const notionalContainer = (d: Ops, i: number) => d.path(i, "notionalCcy").replace(/\.notionalCcy$/, "");

const scenarios: Record<string, Scenario> = {
  "edit one field": { batch: (d) => d.commit(0, "strike", "5"), noisy: ["effector-nested"] },
  "edit two fields of one product": {
    batch: (d) => d.write([{ path: d.path(0, "strike"), value: "6" }, { path: d.path(0, "callPut"), value: "Call" }]),
    noisy: ["valtio", "effector-nested"],
  },
  "an invalid edit (value and issues change together)": {
    batch: (d) => d.commit(1, "strike", "1234"),
    noisy: ["valtio", "effector-nested"],
  },
  "a synced field written from a product": {
    batch: (d) => d.commit(2, "notionalAmount", 1000),
    noisy: ["effector-nested"],
  },
  "a deal broadcast": { batch: (d) => d.write([{ path: "strike", value: "9" }]), noisy: ["effector-nested"] },
  "a settings write": { batch: (d) => d.write([{ path: "isInternal", value: false }]) },
  "a same-value settings write": {
    batch: (d) => d.write([{ path: "isInternal", value: true }, { path: "hedgeType", value: "a" }]),
    noisy: ["effector-nested", "effector-model"],
  },
  "a same-value synced write": { batch: (d) => d.write([{ path: "premiumCcy", value: "2" }]) },
  "a mixed batch: broadcast, sync, setting and a product write": {
    batch: (d) =>
      d.write([
        { path: "expiryDate", value: "2999-01-01" },
        { path: "notionalCcy", value: "USD" },
        { path: "hedgeType", value: "b" },
        { path: d.path(2, "strike"), value: "1" },
      ]),
    noisy: ["valtio", "effector-nested"],
  },
  "a field written and written back in one batch": {
    batch: (d) => d.write([{ path: d.path(0, "strike"), value: "7" }, { path: d.path(0, "strike"), value: "" }]),
    noisy: ["mobx-state-tree", "mobx-keystone", "redux", "zustand", "jotai", "effector-nested", "effector-model"],
  },
  "a synced field written and written back in one batch": {
    batch: (d) => d.write([{ path: "notionalAmount", value: 5 }, { path: "notionalAmount", value: NaN }]),
    noisy: ["mobx-state-tree", "mobx-keystone", "legend-state", "redux", "zustand", "jotai", "effector-nested", "effector-model"],
  },
  "a same-value write": { batch: (d) => d.commit(0, "strike", "") },
  "notional amount Infinity → -Infinity": {
    setup: (d) => d.commit(0, "notionalAmount", Infinity),
    batch: (d) => d.commit(0, "notionalAmount", -Infinity),
    stale: ["mobx"],
    noisy: ["effector-nested"],
  },
  "notional amount 0 → -0": {
    setup: (d) => d.commit(0, "notionalAmount", 0),
    batch: (d) => d.commit(0, "notionalAmount", -0),
    stale: ["mobx"],
    noisy: ["effector-nested"],
  },
  "a write to a container path (an object value)": {
    batch: (d) => d.write([{ path: notionalContainer(d, 0), value: { notionalCcy: "TOOLONGX", amount: 5 } }]),
    stale: ["valtio"],
    noisy: ["effector-nested"],
  },
  "an edit after a container write": {
    setup: (d) => {
      d.write([{ path: "notionalCcy", value: "USD" }]);
      d.write([{ path: notionalContainer(d, 0), value: { notionalCcy: "GBP", amount: 5 } }]);
    },
    batch: (d) => d.commit(0, "notionalCcy", "EUR"),
    stale: ["valtio"],
    noisy: ["effector-nested"],
  },
  "a paste of 280 cells over 40 products": {
    setup: (_d, h) => {
      for (let i = 0; i < 20; i++) h.deal.addGroup("Strategy");
    },
    batch: (d) =>
      d.write(
        d.products().flatMap((_, i) => [
          { path: d.path(i, "strike"), value: String(i % 1000).slice(0, 3) },
          { path: d.path(i, "callPut"), value: i % 2 ? "Call" : "Put" },
          { path: d.path(i, "buySell"), value: "Buy" },
          { path: d.path(i, "expiryCut"), value: `NY${i}` },
          { path: d.path(i, "expiryDate"), value: "2999-01-01" },
          { path: d.path(i, "deliveryDate"), value: "2999-01-03" },
          { path: d.path(i, "premiumDate"), value: "2999-01-02" },
        ]),
      ),
    noisy: ["valtio", "effector-nested"],
  },
  "remove a group": {
    batch: (_d, h) => h.deal.removeGroup(h.deal.getGroups()[0].id),
    stale: ["legend-state"],
    noisy: ["valtio"],
  },
  "clone a group": { batch: (_d, h) => h.deal.cloneGroup(h.deal.getGroups()[0].id), noisy: ["valtio", "effector-nested"] },
  "options arrive and a product reconciles": {
    setup: (d, _h, api) => {
      api.mode = "manual";
      d.commit(0, "settlementStyle", "Cash");
    },
    batch: (_d, _h, api) => api.respondAll(),
    noisy: ["valtio", "effector-nested"],
  },
  "a style switch shows a hidden, invalid field": {
    setup: (d, _h, api) => {
      api.mode = "manual";
      d.commit(0, "settlementCcy", "TOOLONG1");
    },
    batch: (d) => d.commit(0, "settlementStyle", "Cash"),
    noisy: ["valtio", "effector-nested"],
  },
};

describe.each(appNames)("%s: change contract", (app) => {
  let h: DealHandle;
  let api: ControlledApi;
  let rec: ReturnType<typeof recorder>;
  let d: Ops;

  beforeEach(async () => {
    api = installControlledApi({ Cash: [{ id: 4, name: "C4" }, { id: 3, name: "Shared" }] }, "auto");
    mockCalculate("manual");
    [h] = (await launch(app)).deals;
    d = ops(h.deal);
    h.deal.addGroup("Strategy");
    h.deal.addGroup("Average");
    await flush();
    rec = recorder(h.deal);
  });
  afterEach(() => {
    rec.stop();
    h.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const [name, scenario] of Object.entries(scenarios)) {
    const run = async () => {
      await scenario.setup?.(d, h, api);
      return rec.measure(() => scenario.batch(d, h, api));
    };

    itFor(app, scenario.stale ?? [])(`${name}: every changed product is reported, and only products in the deal`, async () => {
      const report = await run();
      expect({ missing: report.missing, ghosts: report.ghosts, missingKinds: report.missingKinds }).toEqual({
        missing: [],
        ghosts: [],
        missingKinds: [],
      });
    });

    itFor(app, scenario.noisy ?? [])(`${name}: each product is reported once, and only if it changed`, async () => {
      const report = await run();
      expect({ duplicates: report.duplicates.length, extra: report.extra.length, extraKinds: report.extraKinds }).toEqual({
        duplicates: 0,
        extra: 0,
        extraKinds: [],
      });
    });
  }
});
