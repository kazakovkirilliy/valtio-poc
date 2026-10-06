// node tests/battletest/perf/report.mjs [tag]   -> prints comparison tables from results/scale-<app>[-tag].json
import fs from "node:fs";
import path from "node:path";

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "results");
// node report.mjs [tag1,tag2,...]  -> numbers are the median over the tagged runs (scale-<app>-<tag>.json); no tag: scale-<app>.json
const tags = process.argv[2] ? process.argv[2].split(",") : [""];
const apps = ["valtio", "mobx", "mobx-state-tree", "mobx-keystone", "legend-state", "redux", "zustand", "jotai", "effector-nested", "effector-model"];

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Merges runs: numbers become their median, objects recurse, anything else is the first run's. */
const merge = (runs) => {
  const first = runs[0];
  if (typeof first === "number") return med(runs);
  if (Array.isArray(first)) return first;
  if (first && typeof first === "object") return Object.fromEntries(Object.keys(first).map((k) => [k, merge(runs.map((r) => r?.[k]).filter((v) => v !== undefined))]));
  return first;
};
const data = {};
const raw = {};
for (const app of apps) {
  const loaded = tags
    .map((tag) => path.join(dir, `scale-${app}${tag ? `-${tag}` : ""}.json`))
    .filter((file) => fs.existsSync(file))
    .map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
  if (loaded.length) {
    data[app] = merge(loaded);
    raw[app] = loaded;
  }
}
console.log(`runs per app: ${Object.entries(raw).map(([a, r]) => `${a}=${r.length}`).join(" ")}`);
const sizes = [1, 10, 50, 100];
const f = (n, d = 2) => (Number.isFinite(n) ? (n >= 100 ? n.toFixed(0) : n.toFixed(d)) : "-");

const table = (title, pick, unit = "ms") => {
  console.log(`\n### ${title} (${unit})`);
  console.log(`| app | ${sizes.map((n) => `N=${n}`).join(" | ")} |`);
  console.log(`|---|${sizes.map(() => "---:").join("|")}|`);
  for (const app of Object.keys(data)) {
    console.log(`| ${app} | ${sizes.map((n) => { try { return f(pick(data[app], n)); } catch { return "-"; } }).join(" | ")} |`);
  }
};
const counts = (title, pick) => {
  console.log(`\n### ${title}`);
  console.log(`| app | ${sizes.map((n) => `N=${n}`).join(" | ")} |`);
  console.log(`|---|${sizes.map(() => "---:").join("|")}|`);
  for (const app of Object.keys(data)) {
    console.log(`| ${app} | ${sizes.map((n) => { try { return pick(data[app], n); } catch { return "-"; } }).join(" | ")} |`);
  }
};

const productsRow = () => {
  console.log(`\nproducts per N: ${sizes.map((n) => `${n}->${Object.values(data)[0]?.[n]?.products}`).join(", ")}`);
};
productsRow();

table("build N groups, total, grid subscribed", (d, n) => d[n].buildMs);
table("build: median per addGroup", (d, n) => d[n].addMedianMs);
table("add 1 group (marginal at N)", (d, n) => d[n].structural.add.ms);
table("clone 1 group (marginal at N)", (d, n) => d[n].structural.clone.ms);
table("remove cloned group (marginal at N)", (d, n) => d[n].structural.removeClone.ms);
table("remove added group (marginal at N)", (d, n) => d[n].structural.removeAdded.ms);
table("edit one product field (strike), deal valid", (d, n) => d[n].edit.ms);
table("edit expiryDate (derived + rule)", (d, n) => d[n].editExpiry.ms);
table("edit, same value (no-op)", (d, n) => d[n].editNoop.ms);
table("edit, deal invalid (default state)", (d, n) => d[n].editInvalidDeal.ms);
table("edit, autocalc ON", (d, n) => d[n].editAutocalc.ms);
table("deal broadcast (strike -> every product)", (d, n) => d[n].broadcast.ms);
table("synced field edit on the deal (notionalAmount -> every product)", (d, n) => d[n].sync.ms);
table("synced field edit from one product (premiumCcy)", (d, n) => d[n].syncCcy.ms);
table("synced edit, autocalc ON", (d, n) => d[n].syncAutocalc.ms);
table("paste, 9 local fields x all products (one batch)", (d, n) => d[n].pasteLocal.ms);
table("paste, 13 fields incl. synced + ccyPair x all products (one batch)", (d, n) => d[n].pasteAll.ms);
table("read every cell: readPath + fieldIssues", (d, n) => d[n].readAllMs);
table("read every cell: grid.getCell", (d, n) => d[n].getCellAllMs);
table("headless build N groups", (d, n) => d[`cold-${n}`].buildHeadlessMs);
table("cold first read of every cell after headless build", (d, n) => d[`cold-${n}`].coldReadMs);
table("retained heap per product after build (grid subscribed)", (d, n) => d[n].heapKBPerProduct, "KB");

counts("edit: emits / product ids emitted / cells repainted / field validations", (d, n) => {
  const m = d[n].edit;
  return `${m.emit.emits}/${m.emit.productIds}/${m.cells.cells}/${m.validation.fieldCalls}`;
});
counts("edit expiryDate: emits / ids / cells / validations", (d, n) => {
  const m = d[n].editExpiry;
  return `${m.emit.emits}/${m.emit.productIds}/${m.cells.cells}/${m.validation.fieldCalls}`;
});
counts("edit, deal invalid: emits / ids / cells / validations", (d, n) => {
  const m = d[n].editInvalidDeal;
  return `${m.emit.emits}/${m.emit.productIds}/${m.cells.cells}/${m.validation.fieldCalls}`;
});
counts("edit, autocalc ON: emits / ids / cells / validations", (d, n) => {
  const m = d[n].editAutocalc;
  return `${m.emit.emits}/${m.emit.productIds}/${m.cells.cells}/${m.validation.fieldCalls}`;
});
counts("no-op edit: emits / validations", (d, n) => {
  const m = d[n].editNoop;
  return `${m.emit.emits}/${m.validation.fieldCalls}`;
});
counts("broadcast: emits / ids / cells / validations", (d, n) => {
  const m = d[n].broadcast;
  return `${m.emit.emits}/${m.emit.productIds}/${m.cells.cells}/${m.validation.fieldCalls}`;
});
counts("synced edit on the deal: emits / ids / cells / validations", (d, n) => {
  const m = d[n].sync;
  return `${m.emit.emits}/${m.emit.productIds}/${m.cells.cells}/${m.validation.fieldCalls}`;
});
counts("paste local: emits / ids / cells / validations", (d, n) => {
  const m = d[n].pasteLocal;
  return `${m.emit.emits}/${m.emit.productIds}/${m.cells.cells}/${m.validation.fieldCalls}`;
});
counts("paste all: emits / ids / cells / validations", (d, n) => {
  const m = d[n].pasteAll;
  return `${m.emit.emits}/${m.emit.productIds}/${m.cells.cells}/${m.validation.fieldCalls}`;
});
counts("add group: emits / validations (field-level)", (d, n) => {
  const m = d[n].structural.add;
  return `${m.emit.emits}/${m.validation.fieldCalls}`;
});
counts("clone group: emits / validations", (d, n) => {
  const m = d[n].structural.clone;
  return `${m.emit.emits}/${m.validation.fieldCalls}`;
});
counts("remove group: emits / validations", (d, n) => {
  const m = d[n].structural.removeClone;
  return `${m.emit.emits}/${m.validation.fieldCalls}`;
});
counts("read every cell: first-read validations", (d, n) => `${d[`cold-${n}`].coldReadValidation.fieldCalls}`);
counts("headless build: validations", (d, n) => `${d[`cold-${n}`].buildHeadlessValidation.fieldCalls}`);

// noise: the spread between the tagged runs, N=100
console.log("\n### run-to-run spread at N=100 (min .. max ms over the runs)");
console.log("| app | edit | broadcast | paste (13 fields) | read every cell |");
console.log("|---|---|---|---|---|");
for (const app of Object.keys(raw)) {
  const range = (pick) => {
    const xs = raw[app].map((r) => pick(r[100]));
    return `${f(Math.min(...xs))} .. ${f(Math.max(...xs))}`;
  };
  console.log(`| ${app} | ${range((d) => d.edit.ms)} | ${range((d) => d.broadcast.ms)} | ${range((d) => d.pasteAll.ms)} | ${range((d) => d.readAllMs)} |`);
}
