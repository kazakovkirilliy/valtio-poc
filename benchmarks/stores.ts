import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { atom, createStore } from "jotai/vanilla";
import { proxy, subscribe } from "valtio/vanilla";
import { createStore as createZustandStore } from "zustand/vanilla";

type Fixture = { edit(index: number, value: string): void; dispose(): void };
type Factory = (size: number, check: () => void, notify: () => void) => Fixture;

// All variants have canonical shared state and identical scalar row values.
// Synchronous subscriptions measure work per logical update, without React batching.
const factories: Record<string, Factory> = {
  "Valtio / root subscriptions": (size, check, notify) => {
    const state = proxy({ rows: Array.from({ length: size }, () => ({ value: "" })) });
    const cleanups = state.rows.map((row) => {
      let previous = row.value;
      return subscribe(state, () => {
        check();
        if (previous !== row.value) { previous = row.value; notify(); }
      }, true);
    });
    return { edit: (i, value) => { state.rows[i].value = value; }, dispose: () => cleanups.forEach((f) => f()) };
  },
  "Valtio / row subscriptions": (size, check, notify) => {
    const rows = Array.from({ length: size }, () => proxy({ value: "" }));
    const cleanups = rows.map((row) => subscribe(row, () => { check(); notify(); }, true));
    return { edit: (i, value) => { rows[i].value = value; }, dispose: () => cleanups.forEach((f) => f()) };
  },
  "Zustand / workspace selectors": (size, check, notify) => {
    const store = createZustandStore(() => ({ rows: Array.from({ length: size }, () => "") }));
    const cleanups = store.getState().rows.map((_, i) => {
      let previous = "";
      return store.subscribe((state) => {
        check();
        if (previous !== state.rows[i]) { previous = state.rows[i]; notify(); }
      });
    });
    return {
      edit: (i, value) => store.setState((state) => {
        const rows = state.rows.slice(); rows[i] = value; return { rows };
      }),
      dispose: () => cleanups.forEach((f) => f()),
    };
  },
  "Zustand / row stores": (size, check, notify) => {
    const rows = Array.from({ length: size }, () => createZustandStore(() => ({ value: "" })));
    const cleanups = rows.map((row) => row.subscribe(() => { check(); notify(); }));
    return { edit: (i, value) => rows[i].setState({ value }), dispose: () => cleanups.forEach((f) => f()) };
  },
  "Jotai / field atoms": (size, check, notify) => {
    const store = createStore();
    const rows = Array.from({ length: size }, () => atom(""));
    const cleanups = rows.map((row) => store.sub(row, () => { check(); notify(); }));
    return { edit: (i, value) => store.set(rows[i], value), dispose: () => cleanups.forEach((f) => f()) };
  },
};

const results = [];
const updates = 2_000;
for (const size of [10, 100, 1_000]) {
  for (const [variant, factory] of Object.entries(factories)) {
    const samples = [];
    let checks = 0;
    let notifications = 0;
    for (let repeat = 0; repeat < 7; repeat++) {
      const fixture = factory(size, () => checks++, () => notifications++);
      for (let i = 0; i < 200; i++) fixture.edit(i % size, `warm-${i}`);
      checks = 0; notifications = 0;
      const start = performance.now();
      for (let i = 0; i < updates; i++) fixture.edit(i % size, `${i}`);
      samples.push(performance.now() - start);
      fixture.dispose();
    }
    samples.sort((a, b) => a - b);
    results.push({ variant, rows: size, updates, medianMs: Number(samples[3].toFixed(2)), subscriptionChecks: checks, notifications });
  }
}
const report = { node: process.version, date: new Date().toISOString(), runs: 7, note: "Store subscription microbenchmark, not browser latency. Corrected Valtio and sharded Zustand are included.", results };
console.table(results);
writeFileSync(new URL("./results.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
