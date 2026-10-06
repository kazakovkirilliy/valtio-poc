// node browser-report.mjs r1,r2,r3  -> medians over the tagged browser runs
import fs from "node:fs";
import path from "node:path";

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "results");
const tags = (process.argv[2] ?? "r1").split(",");
const apps = ["valtio", "mobx", "mobx-state-tree", "mobx-keystone", "legend-state", "redux", "zustand", "jotai", "effector-nested", "effector-model"];
const med = (xs) => {
  const clean = xs.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!clean.length) return NaN;
  const s = [...clean].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const f = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "-");
const load = (prefix, app) =>
  tags.map((tag) => path.join(dir, `${prefix}-${app}-${tag}.json`)).filter((file) => fs.existsSync(file)).map((file) => JSON.parse(fs.readFileSync(file, "utf8")));

const rows = apps.map((app) => ({ app, runs: load("browser", app), heap: load("browser-heap", app) })).filter((r) => r.runs.length);
console.log(`runs: ${rows.map((r) => `${r.app}=${r.runs.length}/${r.heap.length}`).join(" ")}`);
const col = (pick) => (r) => f(med(r.runs.map(pick)));
const table = (title, columns) => {
  console.log(`\n### ${title}`);
  console.log(`| app | ${columns.map((c) => c[0]).join(" | ")} |`);
  console.log(`|---|${columns.map(() => "---:").join("|")}|`);
  for (const r of rows) console.log(`| ${r.app} | ${columns.map((c) => c[1](r)).join(" | ")} |`);
};

table("add 50 groups through the buttons (ms, in page)", [
  ["click loop (sync)", col((d) => d.add50.syncMs)],
  ["until 51 group headers in DOM", col((d) => d.add50.domMs)],
  ["until painted (2 rAF)", col((d) => d.add50.paintMs)],
  ["React commits", col((d) => d.add50.commits)],
]);
table("edit latency, Enter -> first DOM change of the watched cell (ms, median of 5), 68 products", [
  ["local edit (own cell)", col((d) => d.editLocal.medianLatencyMs[0])],
  ["synced: deal cell", col((d) => d.editSynced.medianLatencyMs[1])],
  ["synced: product col 5", col((d) => d.editSynced.medianLatencyMs[2])],
  ["broadcast: product col 1", col((d) => d.editBroadcast.medianLatencyMs[1])],
  ["broadcast: product col 6", col((d) => d.editBroadcast.medianLatencyMs[2])],
]);
table("React commits in the 300 ms after an edit (median)", [
  ["local", col((d) => med(d.editLocal.commits))],
  ["synced", col((d) => med(d.editSynced.commits))],
  ["broadcast", col((d) => med(d.editBroadcast.commits))],
  ["paste", col((d) => d.paste.runs.slice(1).reduce((a, b) => a + b.commits, 0) / 3)],
]);
table("paste 16 rows x 68 product columns (ms, in page)", [
  ["handler (store write incl.)", col((d) => d.paste.syncMs)],
  ["until painted", col((d) => d.paste.paintMs)],
  ["status", (r) => r.runs[0].paste.status],
]);
table("tabs (D1)", [
  ["switch back to the 51-group deal: until DOM (ms)", col((d) => d.switchBackToBigDeal.domMs)],
  ["until painted (ms)", col((d) => d.switchBackToBigDeal.paintMs)],
  ["spot ticks while hidden", col((d) => d.inactiveTabSpot.ticksWhileHidden)],
  ["expected at 500 ms", col((d) => d.inactiveTabSpot.expectedAt500ms)],
]);
table("browser JS heap", [
  ["initial (KB)", col((d) => d.heapKBInitial)],
  ["growth per add/clone/remove cycle (KB, after GC)", (r) => f(med(r.heap.map((h) => h.kbPerCycle)))],
  ["first/last sample (KB)", (r) => `${f(r.heap[0]?.samples[0].kb, 0)} / ${f(r.heap[0]?.samples.at(-1).kb, 0)}`],
]);
table("which components re-rendered in the commit(s) after a local edit", [["components", (r) => JSON.stringify(r.runs[0].editLocal.rendered)]]);
table("which components re-rendered after a paste (first run)", [["components", (r) => JSON.stringify(r.runs[0].paste.runs[1].rendered)]]);
table("errors", [["console errors", (r) => String(Math.max(...r.runs.map((d) => d.consoleErrorCount)))]]);
