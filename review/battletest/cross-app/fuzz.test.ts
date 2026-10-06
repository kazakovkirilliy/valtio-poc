import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  type AppName,
  type ControlledApi,
  type Page,
  appNames,
  calcControl,
  exactJson,
  flush,
  installControlledApi,
  launch,
  mockCalculate,
  normalized,
  ops,
  saveResults,
} from "./support/harness.ts";

/**
 * Differential fuzzing: one seeded sequence of operations (edits, pastes,
 * broadcasts, groups coming and going, the autocalc switch, Calculate, and
 * the options and pricing responses arriving, failing, or the server's list
 * changing) is run against every app; after each step, every app's deal is
 * compared by position (values, presence, issues, the deal's fields and
 * settings, the price, what is still pending). The apps share every rule,
 * so any difference is a store-level divergence.
 *
 * Values stay within what every app accepts (no null/undefined or wrongly
 * typed synced values: MST throws, keystone resets — see batches.test.ts).
 * FUZZ_SEEDS / FUZZ_OPS widen the search.
 */

const SEEDS = Number(process.env.FUZZ_SEEDS ?? 30);
const OPS = Number(process.env.FUZZ_OPS ?? 60);

const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pools: Record<string, unknown[]> = {
  strike: ["1", "12", "1234", "", " "],
  callPut: ["Call", "Put", "Nope", ""],
  buySell: ["Buy", "Sell", ""],
  ccyPair: ["EURUSD", "GBPJPY", "nope", ""],
  expiryCut: ["NY10", "TOKYO-15-LONG", ""],
  expiryDate: ["2999-01-01", "2000-01-01", "", "bad"],
  deliveryDate: ["2999-01-03", "2998-01-01", ""],
  premiumDate: ["2999-01-02", ""],
  settlementStyle: ["Cash", "Delivery", "Cash", "Weekly"],
  settlementCcy: ["EUR", "TOOLONG1", ""],
  settlementFixingSource: ["3", "4", "5", "9"],
  expiryDays: [5, -1, NaN, 0],
  notionalAmount: [1000, -5, NaN, 0, 2500],
  notionalCcy: ["USD", "EUR", "TOOLONGX", ""],
  premiumCcy: ["EUR", "GBP", "1234567"],
};
const productFields = Object.keys(pools);
const broadcastFields = ["strike", "callPut", "buySell", "ccyPair", "expiryCut", "expiryDate", "deliveryDate", "premiumDate", "settlementStyle", "settlementCcy", "settlementFixingSource"];
const syncedFields = ["notionalAmount", "notionalCcy", "premiumCcy"];
const serverLists = [
  [{ id: 4, name: "C4" }, { id: 3, name: "Shared" }],
  [{ id: 4, name: "C4" }],
  [{ id: 3, name: "Shared" }, { id: 5, name: "C5" }],
];

type Op =
  | { kind: "commit"; product: number; field: string; value: number }
  | { kind: "broadcast"; field: string; value: number }
  | { kind: "sync"; field: string; value: number }
  | { kind: "paste"; writes: { target: "deal" | number; field: string; value: number }[] }
  | { kind: "setting"; which: number }
  | { kind: "add"; type: number }
  | { kind: "clone"; group: number }
  | { kind: "remove"; group: number }
  | { kind: "autocalc"; on: boolean }
  | { kind: "calculate" }
  | { kind: "respond"; fail: boolean }
  | { kind: "price"; fail: boolean }
  | { kind: "serverList"; list: number };

const generate = (seed: number): Op[] => {
  const random = mulberry32(seed);
  const int = (n: number) => Math.floor(random() * n);
  const pick = <T,>(items: readonly T[]) => items[int(items.length)];
  return Array.from({ length: OPS }, (): Op => {
    const roll = random();
    if (roll < 0.26) {
      const field = pick(productFields);
      return { kind: "commit", product: int(8), field, value: int(pools[field].length) };
    }
    if (roll < 0.34) {
      const field = pick(broadcastFields);
      return { kind: "broadcast", field, value: int(pools[field].length) };
    }
    if (roll < 0.4) {
      const field = pick(syncedFields);
      return { kind: "sync", field, value: int(pools[field].length) };
    }
    if (roll < 0.48) {
      return {
        kind: "paste",
        writes: Array.from({ length: 2 + int(5) }, () => {
          const target = random() < 0.25 ? ("deal" as const) : int(8);
          const field = target === "deal" ? pick([...broadcastFields, ...syncedFields]) : pick(productFields);
          return { target, field, value: int(pools[field].length) };
        }),
      };
    }
    if (roll < 0.51) return { kind: "setting", which: int(4) };
    if (roll < 0.57) return { kind: "add", type: int(3) };
    if (roll < 0.61) return { kind: "clone", group: int(6) };
    if (roll < 0.65) return { kind: "remove", group: int(6) };
    if (roll < 0.69) return { kind: "autocalc", on: random() < 0.7 };
    if (roll < 0.72) return { kind: "calculate" };
    if (roll < 0.84) return { kind: "respond", fail: random() < 0.12 };
    if (roll < 0.97) return { kind: "price", fail: random() < 0.12 };
    return { kind: "serverList", list: int(serverLists.length) };
  });
};

const groupTypes = ["VanillaGroup", "Strategy", "Average"] as const;

/** Runs the ops on one app; the state after each step. */
const run = async (app: AppName, script: Op[]) => {
  const api: ControlledApi = installControlledApi({ Cash: serverLists[0] });
  mockCalculate("manual");
  const page: Page = await launch(app);
  const [h] = page.deals;
  const d = ops(h.deal);
  h.deal.addGroup("Strategy");
  h.deal.addGroup("Average");
  await flush(2);
  const states: string[] = [];
  const record = (step: string) => {
    const state = normalized(h);
    states.push(
      exactJson({
        step,
        ...state,
        options: d.count() >= 0 ? h.deal.getOptions()["fixingSources:Cash"] : undefined,
        pendingFetches: api.pending.length,
        requests: api.requests.length,
        pendingPrices: calcControl.pending().length,
        prices: calcControl.calls.length,
      }),
    );
  };
  const productPath = (index: number, field: string) => d.path(index % d.count(), field);
  const errors: string[] = [];
  for (const [index, op] of script.entries()) {
    try {
      switch (op.kind) {
        case "commit":
          if (d.count()) d.commit(op.product % d.count(), op.field, pools[op.field][op.value]);
          break;
        case "broadcast":
        case "sync":
          d.write([{ path: op.field, value: pools[op.field][op.value] }]);
          break;
        case "paste":
          d.write(
            op.writes.flatMap(({ target, field, value }) =>
              target === "deal" ? [{ path: field, value: pools[field][value] }] : d.count() ? [{ path: productPath(target, field), value: pools[field][value] }] : [],
            ),
          );
          break;
        case "setting":
          d.write([[{ path: "isInternal", value: false }], [{ path: "isInternal", value: "true" }], [{ path: "hedgeType", value: "b" }], [{ path: "hedgeType", value: "e" }]][op.which]);
          break;
        case "add":
          h.deal.addGroup(groupTypes[op.type]);
          break;
        case "clone": {
          const groups = h.deal.getGroups();
          if (groups.length) h.deal.cloneGroup(groups[op.group % groups.length].id);
          break;
        }
        case "remove": {
          const groups = h.deal.getGroups();
          if (groups.length) h.deal.removeGroup(groups[op.group % groups.length].id);
          break;
        }
        case "autocalc":
          page.setAutocalc(op.on);
          break;
        case "calculate":
          h.calculate();
          break;
        case "respond": {
          const oldest = api.pending[0];
          if (oldest) {
            if (op.fail) oldest.fail();
            else oldest.respond();
          }
          break;
        }
        case "price": {
          const oldest = calcControl.pending()[0];
          if (oldest) {
            if (op.fail) oldest.reject();
            else oldest.resolve();
          }
          break;
        }
        case "serverList":
          api.lists.Cash = serverLists[op.list];
          break;
      }
    } catch (error) {
      errors.push(`step ${index} ${op.kind}: ${(error as Error).message.split("\n")[0]}`);
    }
    await flush(2);
    record(`${index} ${JSON.stringify(op)}`);
  }
  // settle: answer everything until nothing is pending
  for (let round = 0; round < 20 && (api.pending.length || calcControl.pending().length); round++) {
    api.respondAll();
    await flush(2);
    calcControl.resolveAll();
    await flush(2);
  }
  record("settled");
  h.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  return { states, errors };
};

/** Where each app first differs from the majority, comparing only `keys` of each state. */
const firstDivergences = (runs: Record<string, { states: string[] }>, keys: (key: string) => boolean) => {
  const apps = Object.keys(runs);
  const steps = Math.max(...apps.map((app) => runs[app].states.length));
  const project = (state: string | undefined) => {
    const parsed = JSON.parse(state ?? "null") ?? {};
    return JSON.stringify(Object.fromEntries(Object.entries(parsed).filter(([key]) => keys(key))));
  };
  const diverged: Record<string, { step: number; at: string; app: unknown }> = {};
  for (let step = 0; step < steps; step++) {
    const projected = Object.fromEntries(apps.map((app) => [app, project(runs[app].states[step])]));
    const counts = new Map<string, number>();
    for (const app of apps) counts.set(projected[app], (counts.get(projected[app]) ?? 0) + 1);
    const majority = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    for (const app of apps) {
      if (diverged[app] || projected[app] === majority) continue;
      const mine = JSON.parse(projected[app]);
      const theirs = JSON.parse(majority);
      const differing = Object.fromEntries(
        Object.keys(theirs)
          .filter((key) => JSON.stringify(mine?.[key]) !== JSON.stringify(theirs[key]))
          .map((key) => [key, { majority: theirs[key], app: mine?.[key] }]),
      );
      diverged[app] = { step, at: JSON.parse(runs[app].states[step]).step, app: differing };
    }
  }
  return diverged;
};

/** What every app must agree on at every step: everything but how many price requests it took. */
const isValueKey = (key: string) => !["step", "calc", "pendingPrices", "prices"].includes(key);
const isPricingKey = (key: string) => ["calc", "pendingPrices", "prices"].includes(key);

const report: Record<string, unknown> = {};

describe("differential fuzz: every app, the same operations", () => {
  afterAll(() => saveResults("fuzz", report));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (let seed = 1; seed <= SEEDS; seed++) {
    it(`seed ${seed}: all apps end every step in the same state`, async () => {
      const script = generate(seed);
      const runs: Record<string, { states: string[]; errors: string[] }> = {};
      for (const app of appNames) runs[app] = await run(app, script);
      const values = firstDivergences(runs, isValueKey);
      const pricing = firstDivergences(runs, isPricingKey);
      const settled = Object.fromEntries(Object.entries(runs).map(([app, { states }]) => [app, JSON.stringify(JSON.parse(states.at(-1)!).calc)]));
      const settledPrices = new Set(Object.values(settled));
      const errors = Object.fromEntries(Object.entries(runs).filter(([, { errors }]) => errors.length).map(([app, { errors }]) => [app, errors]));
      report[`seed ${seed}`] = { values, pricing, settled: settledPrices.size > 1 ? settled : "agree", errors };
      // values must agree at every step, and the price once everything has settled; request counts are reported only
      expect({ values: Object.keys(values), settledPrices: settledPrices.size, errors }).toEqual({ values: [], settledPrices: 1, errors: {} });
    }, 120_000);
  }
});
