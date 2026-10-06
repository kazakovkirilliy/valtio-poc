// Groups the recorded observations by scenario and flags the apps that differ from the majority.
// usage: node tests/battletest/browser/compare.mjs [scenarioPrefix] [--full]
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "obs");
const args = process.argv.slice(2);
const full = args.includes("--full");
const prefix = args.find((a) => !a.startsWith("--")) ?? "";
const byScenario = new Map();
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && f.startsWith(prefix))) {
  const [scenario, app] = file.replace(/\.json$/, "").split("__");
  const value = JSON.parse(readFileSync(join(dir, file), "utf8"));
  if (!byScenario.has(scenario)) byScenario.set(scenario, new Map());
  byScenario.get(scenario).set(app, value);
}
/** Paths (dot) where `a` and `b` differ. */
const diffPaths = (a, b, path = "") => {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => diffPaths(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return [path];
};
const at = (v, p) => p.split(".").reduce((x, k) => (x == null ? x : x[k]), v);
for (const [scenario, apps] of [...byScenario].sort()) {
  const groups = new Map();
  for (const [app, value] of apps) {
    const key = JSON.stringify(value);
    groups.set(key, [...(groups.get(key) ?? []), app]);
  }
  const sorted = [...groups].sort((a, b) => b[1].length - a[1].length);
  if (sorted.length === 1) {
    console.log(`SAME  ${scenario} (${sorted[0][1].length} apps)`);
    continue;
  }
  console.log(`DIFF  ${scenario}`);
  const [majorityJson, majorityApps] = sorted[0];
  const majority = JSON.parse(majorityJson);
  console.log(`   majority [${majorityApps.join(", ")}]`);
  for (const [json, names] of sorted.slice(1)) {
    const v = JSON.parse(json);
    console.log(`   differs  [${names.join(", ")}]`);
    if (full) {
      console.log(`      ${json}`);
      continue;
    }
    for (const p of diffPaths(majority, v).slice(0, 25)) {
      console.log(`      ${p}: majority=${JSON.stringify(at(majority, p))}  this=${JSON.stringify(at(v, p))}`);
    }
  }
}
