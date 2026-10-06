import { afterEach, describe, expect, it, vi } from "vitest";
import { type DealAdapter, appNames, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi } from "../../stores/support/fakeApi.ts";
import {
  type EmitSummary,
  type Measure,
  buildGroups,
  fmt,
  flush,
  gc,
  groupMix,
  heapMB,
  measure,
  median,
  pasteBatch,
  pasteFields,
  pathOfField,
  productRefs,
  readEveryCell,
  getEveryCell,
  recordCells,
  recordEmits,
  selectedApps,
  sleep,
  turn,
  writeResults,
} from "./harness.ts";
import { resetValidationCounters, validationCounters } from "./valMock.ts";

vi.mock("@shared/validation.ts", async (importOriginal) => {
  const { wrapValidation } = await import("./valMock.ts");
  return wrapValidation(await importOriginal());
});

const SIZES = (process.env.PERF_SIZES ?? "1,10,50,100").split(",").map(Number);
const RUNS = Number(process.env.PERF_RUNS ?? 7);
// the app's header observes readiness for as long as a deal is open; PERF_HEADER=0 leaves it out
const HEADER = process.env.PERF_HEADER !== "0";

let adapters: DealAdapter[] = [];
afterEach(() => {
  adapters.forEach((adapter) => adapter.dispose());
  adapters = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * What every app's DealHeader (CalcBar) does while the deal is open: observe readiness and the
 * calculation, whatever the autocalc switch says. Library-native where that matters (MobX computeds
 * are only cached while observed); elsewhere one readiness read per batch, like a selector.
 */
const watchHeader = async (app: string, adapter: DealAdapter, deal: ReturnType<DealAdapter["deal"]>) => {
  if (app === "mobx" || app === "mobx-state-tree" || app === "mobx-keystone") {
    const { autorun } = await import("mobx");
    return autorun(() => {
      adapter.hasValidationErrors();
      adapter.calc();
    });
  }
  let scheduled = false;
  return deal.subscribe(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      adapter.hasValidationErrors();
    });
  });
};

const dateOf = (i: number) => `2031-02-${String(10 + (i % 18)).padStart(2, "0")}`;

type StructuralResult = Record<string, { ms: number; syncMs: number; emit: EmitSummary; cells: Measure["cells"]; validation: Measure["validation"] }>;

/** Add, clone and remove one group at the end/middle of an N-group deal; the deal is the same size again afterwards. */
const structural = async (deal: ReturnType<DealAdapter["deal"]>, w: Parameters<typeof measure>[0], runs: number): Promise<StructuralResult> => {
  const times: Record<string, number[]> = { add: [], clone: [], removeClone: [], removeAdded: [] };
  const sync: Record<string, number[]> = { add: [], clone: [], removeClone: [], removeAdded: [] };
  const first: Record<string, Pick<Measure, "emit" | "cells" | "validation">> = {};
  const op = async (name: string, i: number, fn: () => void) => {
    gc();
    w.emits.reset();
    w.cells.reset();
    resetValidationCounters();
    const t0 = performance.now();
    fn();
    const t1 = performance.now();
    await flush();
    const t2 = performance.now();
    if (i >= 2) {
      times[name].push(t2 - t0);
      sync[name].push(t1 - t0);
    }
    if (i === 2) {
      await turn();
      first[name] = { emit: w.emits.summary(), cells: w.cells.summary(), validation: { ...validationCounters() } };
    }
  };
  for (let i = 0; i < runs + 2; i++) {
    await op("add", i, () => deal.addGroup(groupMix[i % 3]));
    const groups = deal.getGroups();
    const added = groups[groups.length - 1].id;
    const mid = groups[Math.floor(groups.length / 2)].id;
    const before = new Set(groups.map((g) => g.id));
    await op("clone", i, () => deal.cloneGroup(mid));
    const cloneId = deal.getGroups().find((g) => !before.has(g.id))!.id;
    await op("removeClone", i, () => deal.removeGroup(cloneId));
    await op("removeAdded", i, () => deal.removeGroup(added));
  }
  return Object.fromEntries(
    Object.keys(times).map((name) => [name, { ms: median(times[name]), syncMs: median(sync[name]), ...first[name] }]),
  );
};

const runSize = async (app: (typeof appNames)[number], groups: number, runs: number) => {
  installFakeApi({ Cash: [{ id: 1, name: "A" }, { id: 2, name: "B" }], Delivery: [] });
  const adapter = await createAdapter(app);
  adapters.push(adapter);
  const deal = adapter.deal();
  const grid = adapter.grid();
  const w = { emits: recordEmits(deal), cells: recordCells(grid) };
  const stopHeader = HEADER ? await watchHeader(app, adapter, deal) : () => {};
  deal.writePaths([{ path: "notionalCcy", value: "USD" }]); // valid: new products start from it
  await sleep(30); // the deal column's Cash options
  gc();
  const heap0 = heapMB();

  // --- build, with the grid subscribed (as in the app)
  const tBuild0 = performance.now();
  const addTimes = buildGroups(deal, groups);
  await flush();
  const buildMs = performance.now() - tBuild0;
  await turn();
  const heap1 = heapMB();
  const refs = productRefs(deal);
  const P = refs.length;
  const mid = refs[Math.floor(P / 2)];
  const out: Record<string, unknown> = {
    groups,
    products: P,
    buildMs,
    addMedianMs: median(addTimes),
    addLastMs: median(addTimes.slice(-Math.min(5, addTimes.length))),
    heapKBPerProduct: ((heap1 - heap0) * 1024) / P,
  };
  expect(adapter.hasValidationErrors()).toBe(false);

  // --- marginal structural ops
  out.structural = await structural(deal, w, Math.min(runs, 5));
  await sleep(10);

  // --- a single product edit (deal valid)
  const strikePath = pathOfField(mid, "strike");
  out.edit = await measure(w, (i) => deal.writePaths([{ path: strikePath, value: String(100 + (i % 800)) }]), { runs: runs + 8 });
  const expiryPath = pathOfField(mid, "expiryDate");
  out.editExpiry = await measure(w, (i) => deal.writePaths([{ path: expiryPath, value: dateOf(i) }]), { runs });
  // writing a value the field already has: should be free
  out.editNoop = await measure(w, () => deal.writePaths([{ path: strikePath, value: "555" }]), { runs, warmup: 2 });

  // --- broadcast and synced edits
  out.broadcast = await measure(w, (i) => deal.writePaths([{ path: "strike", value: String(100 + (i % 800)) }]), { runs: Math.max(3, runs - 2) });
  out.sync = await measure(w, (i) => deal.writePaths([{ path: "notionalAmount", value: 2000 + i }]), { runs: Math.max(3, runs - 2) });
  out.syncCcy = await measure(w, (i) => deal.writePaths([{ path: pathOfField(mid, "premiumCcy"), value: ["USD", "EUR", "GBP"][i % 3] }]), { runs: Math.max(3, runs - 2) });

  // --- pastes through the grid source
  const pasteRuns = Math.max(2, Math.min(runs, 5) - 2);
  out.pasteLocal = await measure(w, (i) => grid.write(pasteBatch(refs, pasteFields.local, i)), { runs: pasteRuns, warmup: 1 });
  out.pasteAll = await measure(w, (i) => grid.write(pasteBatch(refs, pasteFields.all, i)), { runs: pasteRuns, warmup: 1 });
  out.pasteLocalWrites = pasteBatch(refs, pasteFields.local, 0).length;
  out.pasteAllWrites = pasteBatch(refs, pasteFields.all, 0).length;

  // --- read every cell once
  await flush();
  {
    const times: number[] = [];
    const times2: number[] = [];
    let sum = 0;
    resetValidationCounters();
    for (let i = 0; i < runs + 2; i++) {
      const t0 = performance.now();
      sum += readEveryCell(deal, refs);
      const t1 = performance.now();
      sum += getEveryCell(grid, refs);
      const t2 = performance.now();
      if (i >= 2) {
        times.push(t1 - t0);
        times2.push(t2 - t1);
      }
    }
    out.readAllMs = median(times);
    out.getCellAllMs = median(times2);
    out.readCells = refs.reduce((n, ref) => n + Object.keys(ref.fieldPaths).length, 0);
    out.readChecksum = sum;
  }

  // --- the deal column's own paths: invalid state (every product has an issue)
  deal.writePaths([{ path: "notionalCcy", value: "1xxxxxx" }]);
  await flush();
  await turn();
  out.editInvalidDeal = await measure(w, (i) => deal.writePaths([{ path: strikePath, value: String(100 + (i % 800)) }]), { runs });
  deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
  await flush();

  // --- autocalc on: the app's default
  adapter.setAutocalc(true);
  await sleep(60);
  out.editAutocalc = await measure(w, (i) => deal.writePaths([{ path: strikePath, value: String(100 + (i % 800)) }]), { runs, settle: 30 });
  out.syncAutocalc = await measure(w, (i) => deal.writePaths([{ path: "notionalAmount", value: 3000 + i }]), { runs: Math.max(3, runs - 2), settle: 30 });
  adapter.setAutocalc(false);
  await sleep(30);

  stopHeader();
  w.emits.stop();
  w.cells.stop();
  return out;
};

/** Opening a deal with N groups with nothing watching: build it, then read every cell for the first time. */
const runCold = async (app: (typeof appNames)[number], groups: number) => {
  installFakeApi({ Cash: [{ id: 1, name: "A" }], Delivery: [] });
  const adapter = await createAdapter(app);
  adapters.push(adapter);
  const deal = adapter.deal();
  deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
  await sleep(30);
  gc();
  resetValidationCounters();
  const t0 = performance.now();
  buildGroups(deal, groups);
  await flush();
  const buildMs = performance.now() - t0;
  const buildVal = { ...validationCounters() };
  const refs = productRefs(deal);
  resetValidationCounters();
  const t1 = performance.now();
  const sum = readEveryCell(deal, refs);
  const coldReadMs = performance.now() - t1;
  const coldVal = { ...validationCounters() };
  const t2 = performance.now();
  readEveryCell(deal, refs);
  const warmReadMs = performance.now() - t2;
  return { groups, products: refs.length, buildHeadlessMs: buildMs, buildHeadlessValidation: buildVal, coldReadMs, coldReadValidation: coldVal, warmReadMs, sum };
};

describe("scale", () => {
  it.each(selectedApps(appNames))(
    "%s",
    async (app) => {
      // warm the shared code and this app's: a small deal, every workload
      await runSize(app, 10, 3);
      await runCold(app, 10);
      const results: Record<string, unknown> = {};
      for (const groups of SIZES) {
        results[groups] = await runSize(app, groups, RUNS);
        results[`cold-${groups}`] = await runCold(app, groups);
        const r = results[groups] as Record<string, Measure & { ms: number }>;
        console.log(
          `[scale] ${app} N=${groups} P=${(results[groups] as { products: number }).products}`,
          `edit=${fmt(r.edit.ms)}ms emits=${r.edit.emit.emits}/${r.edit.emit.productIds}`,
          `broadcast=${fmt(r.broadcast.ms)}ms sync=${fmt(r.sync.ms)}ms pasteAll=${fmt(r.pasteAll.ms)}ms`,
        );
      }
      writeResults(`scale-${app}${process.env.PERF_TAG ? `-${process.env.PERF_TAG}` : ""}`, results);
    },
    60 * 60 * 1000,
  );
});
