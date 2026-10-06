import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AppName,
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
} from "./support/harness.ts";

/** Batches of path writes: big ones, self-cancelling ones, mixed ones, and writes the deal shouldn't take. */

const seen: Record<string, Partial<Record<AppName, unknown>>> = {};
const note = (key: string, app: AppName, value: unknown) => {
  if (!seen[key]) seen[key] = {};
  seen[key][app] = value;
};

const polluted = () => ({}) as Record<string, unknown>;

describe.each(appNames)("%s: batches", (app) => {
  let page: Page;
  let h: DealHandle;
  let d: ReturnType<typeof ops>;

  beforeEach(async () => {
    installControlledApi({ Cash: [{ id: 4, name: "C4" }, { id: 3, name: "Shared" }] }, "auto");
    mockCalculate("manual");
    page = await launch(app);
    [h] = page.deals;
    d = ops(h.deal);
    h.deal.addGroup("Strategy");
    h.deal.addGroup("Average");
    d.write([{ path: "notionalCcy", value: "USD" }]);
    await flush();
  });
  afterEach(() => {
    h.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (Object.prototype as Record<string, unknown>).polluted;
  });

  /** A paste of 10 fields × every product (as the grid sends it: one `writePaths`). */
  const paste = (round: number) => {
    const paths = Object.fromEntries(
      ["strike", "callPut", "buySell", "expiryCut", "expiryDate", "deliveryDate", "premiumDate", "ccyPair", "settlementCcy", "notionalAmount"].map(
        (fieldId) => [fieldId, d.pathsOf(fieldId)],
      ),
    );
    return paths.strike.flatMap((_, i) => [
      { path: paths.strike[i], value: String((i + round) % 100) },
      { path: paths.callPut[i], value: (i + round) % 2 ? "Call" : "Put" },
      { path: paths.buySell[i], value: (i + round) % 2 ? "Buy" : "Sell" },
      { path: paths.expiryCut[i], value: `NY${round}` },
      { path: paths.expiryDate[i], value: `2999-01-${String((round % 28) + 1).padStart(2, "0")}` },
      { path: paths.deliveryDate[i], value: "2999-02-01" },
      { path: paths.premiumDate[i], value: "2999-01-02" },
      { path: paths.ccyPair[i], value: "EURUSD" },
      { path: paths.settlementCcy[i], value: "EUR" },
      { path: paths.notionalAmount[i], value: 1000 + round }, // synced: the deal and every product
    ]);
  };

  itFor(app, ["effector-model"])("a 1,500-cell paste over 150 products: every value lands, priced once, timed", async () => {
    for (let i = 0; i < 74; i++) h.deal.addGroup("Strategy"); // 3 + 148 = 151 products
    await flush();
    page.setAutocalc(true);
    await flush();
    calcControl.resolveAll();
    await flush();
    const rec = recorder(h.deal);
    const before = calcControl.calls.length;
    const writes = paste(1);
    const started = performance.now();
    d.write(writes);
    const writeMs = performance.now() - started;
    await flush();
    const settledMs = performance.now() - started;
    expect(d.readAll("strike").every((value, i) => value === String((i + 1) % 100))).toBe(true);
    expect(d.readAll("notionalAmount").every((value) => value === 1001)).toBe(true);
    expect(d.readAll("expiryDays").every((value) => typeof value === "number" && value > 0)).toBe(true);
    const firstPasteRequests = calcControl.calls.length - before;
    // 5 pastes in a row, to time a steadier figure (paths built outside the timing)
    const batches = [2, 3, 4, 5, 6].map(paste);
    const repeat = performance.now();
    for (const batch of batches) d.write(batch);
    const repeatMs = (performance.now() - repeat) / batches.length;
    await flush();
    const report = await rec.measure(() => d.write(paste(12)));
    rec.stop();
    note("paste 1,500 cells / 151 products", app, {
      writes: writes.length,
      firstWriteMs: Math.round(writeMs),
      firstSettledMs: Math.round(settledMs),
      avgWriteMs: Math.round(repeatMs),
      emitsForOnePaste: report.emits,
      duplicateIds: report.duplicates.length,
      priceRequestsForThePaste: firstPasteRequests,
    });
    expect(report.missing).toEqual([]);
    expect(firstPasteRequests).toBe(1); // one batch, one price
  }, 60_000);

  itFor(app, ["effector-model"])(
    "a broadcast over 10 groups is one update: listeners never see it half applied, and it is priced once",
    async () => {
      for (let i = 0; i < 8; i++) h.deal.addGroup("VanillaGroup"); // 10 groups, 11 products
      page.setAutocalc(true);
      await flush();
      calcControl.resolveAll();
      await flush();
      const torn: string[] = [];
      let updates = 0;
      const stop = h.deal.subscribe((change) => {
        if (change.kind !== "products") return;
        updates++;
        const strikes = d.readAll("strike");
        if (new Set(strikes).size > 1) torn.push(strikes.join(","));
      });
      const before = calcControl.calls.length;
      d.write([{ path: "strike", value: "9" }]);
      await flush();
      stop();
      const result = { tornReads: torn.length, productEmits: updates, priceRequests: calcControl.calls.length - before };
      note("broadcast over 10 groups", app, result);
      expect(result.tornReads).toBe(0);
      expect(result.priceRequests).toBe(1);
    },
  );

  itFor(app, ["valtio", "mobx-state-tree", "mobx-keystone", "legend-state", "redux", "zustand", "jotai", "effector-nested", "effector-model"])(
    "a synced field written and written back in one batch doesn't outdate a done price",
    async () => {
      h.calculate();
      calcControl.resolveAll();
      await flush();
      expect(h.calc().status).toBe("done");
      d.write([
        { path: "notionalAmount", value: 5 },
        { path: "notionalAmount", value: NaN },
      ]);
      await flush();
      note("synced write-back: calc after", app, h.calc().status);
      expect(h.calc().status).toBe("done");
    },
  );

  itFor(app, ["valtio", "mobx-state-tree", "mobx-keystone", "redux", "zustand", "jotai", "effector-nested", "effector-model"])(
    "a product field written and written back in one batch doesn't outdate a done price",
    async () => {
      h.calculate();
      calcControl.resolveAll();
      await flush();
      d.write([
        { path: d.path(0, "strike"), value: "5" },
        { path: d.path(0, "strike"), value: "" },
      ]);
      await flush();
      note("field write-back: calc after", app, h.calc().status);
      expect(h.calc().status).toBe("done");
    },
  );

  it("a mixed batch lands whole: broadcasts, syncs, settings and product writes, in order", async () => {
    d.write([
      { path: "settlementStyle", value: "Cash" }, // broadcast, loads options
      { path: "expiryDate", value: "2999-06-01" }, // broadcast
      { path: d.path(1, "deliveryDate"), value: "2999-05-01" }, // before expiry: the rule fails
      { path: "premiumCcy", value: "EUR" }, // synced
      { path: d.path(2, "notionalAmount"), value: 250 }, // synced from a product
      { path: "isInternal", value: "false" }, // setting, as the dropdown sends it
      { path: "hedgeType", value: "f" }, // offered once not internal
      { path: d.path(0, "settlementFixingSource"), value: "3" }, // exists after the style
      { path: d.path(0, "ccyPair"), value: "GBPJPY" }, // deal logic: notional ccy → GBP
    ]);
    await flush();
    expect(d.readAll("settlementStyle")).toEqual(["Cash", "Cash", "Cash"]);
    expect(d.readAll("premiumCcy")).toEqual(["EUR", "EUR", "EUR"]);
    expect(d.readAll("notionalAmount")).toEqual([250, 250, 250]);
    expect(d.readAll("notionalCcy")).toEqual(["GBP", "GBP", "GBP"]);
    expect([h.deal.readPath("notionalCcy"), h.deal.readPath("notionalAmount")]).toEqual(["GBP", 250]);
    expect(h.deal.getSettings()).toEqual({ isInternal: false, hedgeType: "f" });
    expect(d.read(0, "settlementFixingSource")).toBe("3"); // still an option: kept after the reload
    expect(d.readAll("settlementFixingSource").slice(1)).toEqual(["4", "4"]);
    expect(d.issues(1, "deliveryDate")).toEqual(["Delivery date can't be before expiry date"]);
    expect(d.issues(0, "deliveryDate")).toEqual([]);
  });

  it("writes to removed or unknown products, unknown roots and malformed paths are ignored", async () => {
    const removedGroup = h.deal.getGroups()[0];
    const removed = d.path(0, "strike");
    h.deal.removeGroup(removedGroup.id);
    await flush();
    const before = exactJson(d.products().map(({ data }) => data));
    expect(() =>
      d.write([
        { path: removed, value: "9" },
        { path: "groups.nope.products.nope.data.optionsCommon.strike", value: "9" },
        { path: `groups.${h.deal.getGroups()[0].id}.products.nope.data.avroCommon.strike`, value: "9" },
        { path: "no.such.root", value: 1 },
        { path: "nope", value: 1 },
        { path: "", value: 1 },
        { path: "groups", value: 1 },
        { path: "groups..products..data.x", value: 1 },
        { path: "__proto__", value: { polluted: true } },
        { path: "constructor", value: 1 },
        { path: "toString", value: 1 },
      ]),
    ).not.toThrow();
    await flush();
    expect(exactJson(d.products().map(({ data }) => data))).toBe(before);
    expect(h.deal.readPath("toString")).toBeUndefined();
    expect(polluted().polluted).toBeUndefined();
  });

  itFor(app, ["valtio", "mobx", "mobx-keystone", "legend-state"])(
    "a product path through __proto__ doesn't pollute Object.prototype",
    async () => {
      const path = d.path(0, "strike").replace(/optionsCommon\.strike$/, "__proto__.polluted");
      try {
        d.write([{ path, value: "yes" }]);
      } catch {
        // throwing is acceptable; polluting isn't
      }
      await flush();
      note("__proto__ path: Object.prototype.polluted", app, polluted().polluted ?? null);
      expect(polluted().polluted).toBeUndefined();
    },
  );

  itFor(app, ["valtio", "mobx", "mobx-keystone", "legend-state"])(
    "a product path through constructor.prototype doesn't pollute Object.prototype, or throw",
    async () => {
      const path = d.path(0, "strike").replace(/optionsCommon\.strike$/, "constructor.prototype.polluted");
      let threw = "";
      try {
        d.write([{ path, value: "yes" }]);
      } catch (error) {
        threw = (error as Error).message;
      }
      await flush();
      note("constructor.prototype path", app, { polluted: polluted().polluted ?? null, threw });
      expect({ polluted: polluted().polluted, threw }).toEqual({ polluted: undefined, threw: "" });
    },
  );

  // every app fails this one way or another: three throw mid-batch (a torn batch), the rest turn the string into an object
  itFor(app, [...appNames])(
    "a write under a leaf (a string field) is skipped: the rest of the batch lands, the field stays a string",
    async () => {
      const path = `${d.path(0, "strike")}.length`; // strike is a string: there is no object under it
      let threw = "";
      try {
        d.write([
          { path: d.path(0, "callPut"), value: "Call" }, // before the bad write
          { path, value: 9 },
          { path: d.path(0, "buySell"), value: "Buy" }, // after it
        ]);
      } catch (error) {
        threw = (error as Error).message;
      }
      await flush();
      const result = { threw, strike: d.read(0, "strike"), callPut: d.read(0, "callPut"), buySell: d.read(0, "buySell") };
      note("write under a string leaf", app, result);
      expect(result).toEqual({ threw: "", strike: "", callPut: "Call", buySell: "Buy" });
    },
  );

  itFor(app, ["mobx-state-tree", "mobx-keystone"])(
    "a synced field set to null or undefined: the deal and every product agree",
    async () => {
      let threw = "";
      try {
        d.write([{ path: "premiumCcy", value: null }]);
        d.commit(1, "notionalAmount", undefined);
      } catch (error) {
        threw = (error as Error).message.split("\n")[0];
      }
      await flush();
      const result = {
        threw,
        premiumCcy: [h.deal.readPath("premiumCcy"), ...d.readAll("premiumCcy")],
        notionalAmount: [h.deal.readPath("notionalAmount"), ...d.readAll("notionalAmount")],
      };
      note("synced null/undefined", app, result);
      expect(result).toEqual({ threw: "", premiumCcy: [null, null, null, null], notionalAmount: [undefined, undefined, undefined, undefined] });
    },
  );

  it("odd values are stored as given and validated alike (compared across apps below)", async () => {
    const results: Record<string, unknown> = {};
    const attempt = (name: string, run: () => void, read: () => unknown) => {
      try {
        run();
        results[name] = read();
      } catch (error) {
        results[name] = `THROWS: ${(error as Error).message.split("\n")[0].slice(0, 80)}`;
      }
    };
    const cell = (i: number, fieldId: string) => () => [d.read(i, fieldId), d.issues(i, fieldId)];
    attempt("strike: whitespace", () => d.commit(0, "strike", "   "), cell(0, "strike"));
    attempt("strike: 10,000 characters", () => d.commit(0, "strike", "x".repeat(10_000)), () => [String(d.read(0, "strike")).length, d.issues(0, "strike")]);
    attempt("strike: a number", () => d.commit(0, "strike", 12), cell(0, "strike"));
    attempt("callPut: null", () => d.commit(1, "callPut", null), cell(1, "callPut"));
    attempt("settlementStyle: 'Cash ' (trailing space)", () => d.commit(1, "settlementStyle", "Cash "), () => [d.read(1, "settlementStyle"), d.has(1, "settlementFixingSource"), d.issues(1, "settlementStyle")]);
    attempt("expiryDays: '5' (a string)", () => d.commit(2, "expiryDays", "5"), () => [d.read(2, "expiryDate"), d.read(2, "expiryDays")]);
    attempt("expiryDays: 1.5", () => d.commit(2, "expiryDays", 1.5), () => [d.read(2, "expiryDays"), d.issues(2, "expiryDays")]);
    attempt("expiryDate: '2999-02-30'", () => d.commit(2, "expiryDate", "2999-02-30"), () => [d.read(2, "expiryDays"), d.issues(2, "expiryDate")]);
    attempt("broadcast strike: NaN (empty: ignored)", () => d.write([{ path: "strike", value: NaN }]), () => d.readAll("strike"));
    attempt("broadcast strike: whitespace", () => d.write([{ path: "strike", value: " " }]), () => d.readAll("strike"));
    attempt("isInternal: 'yes'", () => d.write([{ path: "isInternal", value: "yes" }]), () => h.deal.getSettings());
    attempt("hedgeType: a number", () => d.write([{ path: "hedgeType", value: 4 }]), () => h.deal.getSettings());
    attempt("sync notionalAmount: '1000' (a string)", () => d.write([{ path: "notionalAmount", value: "1000" }]), () => [h.deal.readPath("notionalAmount"), d.readAll("notionalAmount"), d.issues(0, "notionalAmount")]);
    attempt("sync notionalCcy: 123 (a number)", () => d.write([{ path: "notionalCcy", value: 123 }]), () => [h.deal.readPath("notionalCcy"), d.readAll("notionalCcy"), d.issues(0, "notionalCcy")]);
    attempt("product notionalAmount: undefined", () => d.commit(2, "notionalAmount", undefined), () => [h.deal.readPath("notionalAmount"), d.readAll("notionalAmount")]);
    attempt("sync premiumCcy: null", () => d.write([{ path: "premiumCcy", value: null }]), () => [h.deal.readPath("premiumCcy"), d.readAll("premiumCcy")]);
    note("odd values", app, results);
  });
});

describe("batches: do the apps agree?", () => {
  afterAll(() => saveResults("batches", seen));

  it("paste timings (reported, not asserted)", () => {
    expect(Object.keys(seen["paste 1,500 cells / 151 products"] ?? {})).toHaveLength(appNames.length);
  });

  const oddCases = () => Object.keys(Object.values(seen["odd values"] ?? {})[0] ?? {}) as string[];
  it("every app ran the odd values", () => {
    expect(Object.keys(seen["odd values"] ?? {})).toHaveLength(appNames.length);
  });
  // a case per value: do all ten apps store and validate it the same way?
  it.each([
    "strike: whitespace",
    "strike: 10,000 characters",
    "strike: a number",
    "callPut: null",
    "settlementStyle: 'Cash ' (trailing space)",
    "expiryDays: '5' (a string)",
    "expiryDays: 1.5",
    "expiryDate: '2999-02-30'",
    "broadcast strike: NaN (empty: ignored)",
    "broadcast strike: whitespace",
    "isInternal: 'yes'",
    "hedgeType: a number",
  ])("odd value agrees across apps: %s", (name) => {
    expect(oddCases()).toContain(name);
    const byApp = Object.fromEntries(Object.entries(seen["odd values"]).map(([app, results]) => [app, exactJson((results as Record<string, unknown>)[name])]));
    expect(new Set(Object.values(byApp)).size, JSON.stringify(byApp, null, 1)).toBe(1);
  });
  // verified divergences: MST's deal model types its synced fields (throws), keystone's props fall back to their default on null/undefined
  (process.env.STRICT === "1" ? it : it.fails).each([
    "sync notionalCcy: 123 (a number)",
    "sync premiumCcy: null",
    "sync notionalAmount: '1000' (a string)",
    "product notionalAmount: undefined",
  ])("odd value agrees across apps: %s", (name) => {
    const byApp = Object.fromEntries(Object.entries(seen["odd values"]).map(([app, results]) => [app, exactJson((results as Record<string, unknown>)[name])]));
    expect(new Set(Object.values(byApp)).size, JSON.stringify(byApp, null, 1)).toBe(1);
  });
});
