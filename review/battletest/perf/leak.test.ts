import { afterEach, describe, it, vi } from "vitest";
import { type DealAdapter, appNames, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi } from "../../stores/support/fakeApi.ts";
import {
  buildGroups,
  flush,
  gc,
  heapMB,
  pathOfField,
  productRefs,
  recordCells,
  recordEmits,
  selectedApps,
  sleep,
  turn,
  writeResults,
} from "./harness.ts";

const CYCLES = Number(process.env.PERF_CYCLES ?? 500);
const SAMPLE_EVERY = Number(process.env.PERF_SAMPLE_EVERY ?? 100);
const BASE_GROUPS = Number(process.env.PERF_BASE_GROUPS ?? 10);

let adapters: DealAdapter[] = [];
afterEach(() => {
  adapters.forEach((adapter) => adapter.dispose());
  adapters = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Mode = "headless" | "grid";

/** The header emulation (see scale.test.ts): readiness observed while the deal is open. */
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

/** One add / edit / clone / edit / remove / remove cycle: four products come and go. */
const cycle = async (deal: ReturnType<DealAdapter["deal"]>, i: number) => {
  deal.addGroup("Strategy");
  let groups = deal.getGroups();
  const added = groups[groups.length - 1];
  let refs = productRefs(deal).filter((ref) => ref.groupId === added.id);
  deal.writePaths(refs.map((ref) => ({ path: pathOfField(ref, "strike"), value: String(100 + (i % 800)) })));
  const before = new Set(groups.map((g) => g.id));
  deal.cloneGroup(added.id);
  groups = deal.getGroups();
  const clone = groups.find((g) => !before.has(g.id))!;
  refs = productRefs(deal).filter((ref) => ref.groupId === clone.id);
  deal.writePaths(refs.map((ref) => ({ path: pathOfField(ref, "expiryDate"), value: `2031-02-${String(10 + (i % 18)).padStart(2, "0")}` })));
  await flush();
  deal.removeGroup(clone.id);
  deal.removeGroup(added.id);
  await flush();
};

const runLeak = async (app: (typeof appNames)[number], mode: Mode, cycles: number) => {
  installFakeApi({ Cash: [{ id: 1, name: "A" }], Delivery: [] });
  const adapter = await createAdapter(app);
  adapters.push(adapter);
  const deal = adapter.deal();
  const stops: (() => void)[] = [];
  if (mode === "grid") {
    const grid = adapter.grid();
    stops.push(recordCells(grid).stop, recordEmits(deal).stop);
  }
  stops.push(await watchHeader(app, adapter, deal));
  deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
  await sleep(30);
  buildGroups(deal, BASE_GROUPS);
  await flush();
  // warm up: caches, JIT, lazily created singletons
  for (let i = 0; i < 40; i++) await cycle(deal, i);
  await turn();
  const samples: { cycle: number; heapMB: number }[] = [{ cycle: 0, heapMB: heapMB() }];
  const t0 = performance.now();
  for (let i = 1; i <= cycles; i++) {
    await cycle(deal, i);
    if (i % SAMPLE_EVERY === 0) samples.push({ cycle: i, heapMB: heapMB() });
  }
  const msPerCycle = (performance.now() - t0) / cycles;
  // least-squares slope of heap over cycles, KB per cycle (one cycle = four products created and dropped)
  const xs = samples.map((s) => s.cycle);
  const ys = samples.map((s) => s.heapMB * 1024);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0) / xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
  stops.forEach((stop) => stop());
  return { app, mode, cycles, baseGroups: BASE_GROUPS, samples, kbPerCycle: slope, kbPerProduct: slope / 4, totalGrowthMB: samples[samples.length - 1].heapMB - samples[0].heapMB, msPerCycle };
};

describe("leaks", () => {
  it.each(selectedApps(appNames))(
    "%s",
    async (app) => {
      const results = [];
      for (const mode of ["headless", "grid"] as Mode[]) {
        results.push(await runLeak(app, mode, CYCLES));
        gc();
      }
      writeResults(`leak-${app}${process.env.PERF_TAG ? `-${process.env.PERF_TAG}` : ""}`, results);
    },
    30 * 60 * 1000,
  );
});
