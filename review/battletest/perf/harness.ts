import fs from "node:fs";
import path from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import type { CellRef, CellWrite, GridSource } from "@shared/grid/gridSource.ts";
import type { DealChange, PathDeal } from "@shared/pathDeal.ts";
import { productPath } from "@shared/paths.ts";
import { definitionOfData } from "@shared/products/productWrites.ts";
import { type ValidationCounters, resetValidationCounters, validationCounters } from "./valMock.ts";

export const RESULTS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "results");

export const groupMix = ["VanillaGroup", "Strategy", "Average"] as const;
export type GroupKind = (typeof groupMix)[number];

// ---------------------------------------------------------------------------------------------
// timing

export const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const min = (xs: number[]) => Math.min(...xs);

/** Drains microtasks (the grid notifier, valtio's batched notifications, legend's microtask autocalc). */
export const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
/** A macrotask turn: everything pending in this tick of the event loop has run. */
export const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let gcFn: (() => void) | undefined;
export const gc = () => {
  if (!gcFn) {
    v8.setFlagsFromString("--expose-gc");
    gcFn = vm.runInNewContext("gc") as () => void;
  }
  gcFn();
  gcFn();
};

export const heapMB = () => {
  gc();
  return process.memoryUsage().heapUsed / (1024 * 1024);
};

// ---------------------------------------------------------------------------------------------
// recording what a deal emits

export type EmitSummary = {
  emits: number;
  /** the number of product ids over all `products` emits (an id emitted twice counts twice) */
  productIds: number;
  uniqueProducts: number;
  groupsEmits: number;
  dealFieldsEmits: number;
  settingsEmits: number;
  optionsEmits: number;
  productEmits: number;
};

export const recordEmits = (deal: PathDeal) => {
  let log: DealChange[] = [];
  const stop = deal.subscribe((change) => log.push(change));
  return {
    reset: () => {
      log = [];
    },
    summary: (): EmitSummary => {
      const ids: string[] = [];
      for (const change of log) if (change.kind === "products") ids.push(...change.ids);
      return {
        emits: log.length,
        productIds: ids.length,
        uniqueProducts: new Set(ids).size,
        groupsEmits: log.filter((c) => c.kind === "groups").length,
        dealFieldsEmits: log.filter((c) => c.kind === "dealFields").length,
        settingsEmits: log.filter((c) => c.kind === "settings").length,
        optionsEmits: log.filter((c) => c.kind === "options").length,
        productEmits: log.filter((c) => c.kind === "products").length,
      };
    },
    stop,
  };
};

/** The cells the grid source reports changed (what the grid would repaint). */
export const recordCells = (grid: GridSource) => {
  let callbacks = 0;
  let cells: CellRef[] = [];
  const stop = grid.subscribeCells((changed) => {
    callbacks += 1;
    cells.push(...changed);
  });
  return {
    reset: () => {
      callbacks = 0;
      cells = [];
    },
    summary: () => ({ callbacks, cells: cells.length, uniqueCells: new Set(cells.map((c) => `${c.columnId}:${c.fieldId}`)).size }),
    stop,
  };
};

// ---------------------------------------------------------------------------------------------
// building and addressing a deal

export const buildGroups = (deal: PathDeal, groups: number) => {
  const times: number[] = [];
  for (let i = 0; i < groups; i++) {
    const t0 = performance.now();
    deal.addGroup(groupMix[i % groupMix.length]);
    times.push(performance.now() - t0);
  }
  return times;
};

export type ProductRef = { groupId: string; productId: string; fieldPaths: Record<string, string> };

export const productRefs = (deal: PathDeal): ProductRef[] =>
  deal.getGroups().flatMap((group) =>
    group.productIds.map((productId) => ({
      groupId: group.id,
      productId,
      fieldPaths: definitionOfData(deal.getProduct(productId)!.data).fieldPaths as Record<string, string>,
    })),
  );

export const pathOfField = (ref: ProductRef, fieldId: string) => productPath(ref.groupId, ref.productId, ref.fieldPaths[fieldId]);

/** One pass over every cell: readPath + fieldIssues for every field of every product. Returns a checksum so it isn't optimised away. */
export const readEveryCell = (deal: PathDeal, refs: ProductRef[]) => {
  let sum = 0;
  for (const ref of refs) {
    for (const fieldId of Object.keys(ref.fieldPaths)) {
      const value = deal.readPath(productPath(ref.groupId, ref.productId, ref.fieldPaths[fieldId]));
      if (value !== undefined) sum += 1;
      sum += deal.fieldIssues(ref.productId, fieldId as never).length;
    }
  }
  return sum;
};

/** What the grid does per cell: `getCell` for every product column and field. */
export const getEveryCell = (grid: GridSource, refs: ProductRef[]) => {
  let sum = 0;
  for (const ref of refs) {
    for (const fieldId of Object.keys(ref.fieldPaths)) {
      if (grid.getCell(ref.productId, fieldId as never)) sum += 1;
    }
  }
  return sum;
};

// ---------------------------------------------------------------------------------------------
// paste payloads

const dateOf = (base: string, offset: number) => `${base}-${String(10 + (offset % 18)).padStart(2, "0")}`;

/** Paste payloads: `local` stays inside each product; `all` also writes the synced fields and a ccy pair. */
export const pasteFields = {
  local: ["expiryDate", "deliveryDate", "settlementStyle", "settlementCcy", "strike", "callPut", "buySell", "expiryCut", "premiumDate"],
  all: [
    "notionalCcy",
    "notionalAmount",
    "premiumCcy",
    "expiryDate",
    "deliveryDate",
    "settlementStyle",
    "settlementCcy",
    "strike",
    "callPut",
    "buySell",
    "ccyPair",
    "expiryCut",
    "premiumDate",
  ],
} as const;

export const pasteValue = (fieldId: string, run: number, p: number): unknown => {
  switch (fieldId) {
    case "notionalCcy":
      return ["USD", "EUR", "GBP", "CHF"][run % 4];
    case "premiumCcy":
      return ["USD", "EUR", "GBP"][run % 3];
    case "notionalAmount":
      return 1000 + run;
    case "expiryDate":
      return dateOf("2030-01", run + p);
    case "deliveryDate":
      return dateOf("2031-01", run + p);
    case "premiumDate":
      return dateOf("2029-06", run + p);
    case "settlementStyle":
      return "Delivery";
    case "settlementCcy":
      return ["USD", "EUR"][(run + p) % 2];
    case "strike":
      return String(100 + ((run * 7 + p) % 800));
    case "callPut":
      return (run + p) % 2 ? "Call" : "Put";
    case "buySell":
      return (run + p) % 2 ? "Buy" : "Sell";
    case "ccyPair":
      return "EURUSD";
    case "expiryCut":
      return `cut${(run + p) % 100}`;
    default:
      throw new Error(`no paste value for ${fieldId}`);
  }
};

/** Row-major writes, like `pasteWrites` produces them: field by field, every product within a field. */
export const pasteBatch = (refs: ProductRef[], fieldIds: readonly string[], run: number): CellWrite[] =>
  fieldIds.flatMap((fieldId) =>
    refs.flatMap((ref, p) => (fieldId in ref.fieldPaths ? [{ columnId: ref.productId, fieldId: fieldId as never, value: pasteValue(fieldId, run, p) }] : [])),
  );

// ---------------------------------------------------------------------------------------------
// measuring a workload

export type Measure = {
  /** median wall time of the write, plus a microtask drain (what the grid sees as one update) */
  ms: number;
  /** median wall time of the write call alone (before any microtask runs: no grid read-back yet) */
  syncMs: number;
  all: number[];
  emit: EmitSummary;
  cells: { callbacks: number; cells: number; uniqueCells: number };
  validation: ValidationCounters;
  runs: number;
};

export type Watchers = {
  emits: ReturnType<typeof recordEmits>;
  cells: ReturnType<typeof recordCells>;
};

/**
 * Runs `fn(i)` `runs` times after `warmup` unmeasured ones. Per run: gc, reset the recorders,
 * time `fn` and a microtask drain. Emit, cell and validation counts come from the first
 * measured run (they are the same on every run for these workloads).
 */
export const measure = async (
  watchers: Watchers,
  fn: (i: number) => void | Promise<void>,
  { runs = 7, warmup = 2, settle = 0 }: { runs?: number; warmup?: number; settle?: number } = {},
): Promise<Measure> => {
  for (let i = 0; i < warmup; i++) {
    const pending = fn(i);
    if (pending) await pending;
    await flush();
    if (settle) await sleep(settle);
  }
  const all: number[] = [];
  const sync: number[] = [];
  let first: Pick<Measure, "emit" | "cells" | "validation"> | undefined;
  for (let i = 0; i < runs; i++) {
    gc();
    watchers.emits.reset();
    watchers.cells.reset();
    resetValidationCounters();
    const t0 = performance.now();
    const pending = fn(warmup + i);
    const t1 = performance.now(); // the write itself: no microtask has run yet
    if (pending) await pending;
    await flush();
    const t2 = performance.now();
    all.push(t2 - t0);
    sync.push(t1 - t0);
    if (!first) {
      // let anything slower than a microtask land before counting (valtio batches in a promise, effects in timers)
      await turn();
      first = { emit: watchers.emits.summary(), cells: watchers.cells.summary(), validation: { ...validationCounters() } };
    }
    if (settle) await sleep(settle);
  }
  return { ms: median(all), syncMs: median(sync), all, runs, ...(first as NonNullable<typeof first>) };
};

export const writeResults = (name: string, data: unknown) => {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, `${name}.json`), JSON.stringify(data, null, 2));
};

export const selectedApps = <T extends string>(all: readonly T[]): T[] => {
  const only = process.env.PERF_APPS;
  if (!only) return [...all];
  const wanted = only.split(",").map((s) => s.trim());
  return all.filter((app) => wanted.includes(app));
};

export const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : "-");
