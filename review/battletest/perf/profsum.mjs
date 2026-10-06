// node profsum.mjs file.cpuprofile [top]  -> self time by function and by area
import fs from "node:fs";

const [, , file, topArg] = process.argv;
const top = Number(topArg ?? 18);
const profile = JSON.parse(fs.readFileSync(file, "utf8"));
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) {
  self.set(profile.samples[i], (self.get(profile.samples[i]) ?? 0) + (dt[i] ?? 0));
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
const area = (url) => {
  if (!url) return "(native/idle)";
  const m = url.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);
  if (m) return m[1];
  const s = url.match(/(src-[a-z-]+)\//);
  if (s) return s[1];
  if (url.includes("tests/battletest")) return "harness";
  return url.split("/").slice(-2).join("/");
};
const fnRows = new Map();
const areaRows = new Map();
for (const [id, t] of self) {
  const node = byId.get(id);
  const cf = node.callFrame;
  const key = `${cf.functionName || "(anonymous)"}  ${cf.url.replace(/.*\/(valtio-poc)\//, "").replace(/\?.*$/, "")}:${cf.lineNumber + 1}`;
  fnRows.set(key, (fnRows.get(key) ?? 0) + t);
  const a = area(cf.url);
  areaRows.set(a, (areaRows.get(a) ?? 0) + t);
}
const ms = (u) => (u / 1000).toFixed(1);
console.log(`total sampled ${ms(total)} ms`);
console.log("-- by area");
for (const [k, v] of [...areaRows].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`${ms(v).padStart(8)} ms ${((100 * v) / total).toFixed(0).padStart(3)}%  ${k}`);
console.log("-- top functions (self)");
for (const [k, v] of [...fnRows].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${ms(v).padStart(8)} ms ${((100 * v) / total).toFixed(0).padStart(3)}%  ${k}`);
