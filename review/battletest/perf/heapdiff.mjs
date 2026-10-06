// node heapdiff.mjs a.heapsnapshot b.heapsnapshot [top]  -> what grew between two snapshots, by (type, name)
import fs from "node:fs";

const load = (file) => {
  const snap = JSON.parse(fs.readFileSync(file, "utf8"));
  const fieldsPerNode = snap.snapshot.meta.node_fields.length;
  const typeIdx = snap.snapshot.meta.node_fields.indexOf("type");
  const nameIdx = snap.snapshot.meta.node_fields.indexOf("name");
  const sizeIdx = snap.snapshot.meta.node_fields.indexOf("self_size");
  const types = snap.snapshot.meta.node_types[0];
  const counts = new Map();
  for (let i = 0; i < snap.nodes.length; i += fieldsPerNode) {
    const type = types[snap.nodes[i + typeIdx]];
    const name = snap.strings[snap.nodes[i + nameIdx]];
    const key = `${type}:${name.length > 80 ? `${name.slice(0, 80)}…` : name}`;
    const entry = counts.get(key) ?? { n: 0, bytes: 0 };
    entry.n += 1;
    entry.bytes += snap.nodes[i + sizeIdx];
    counts.set(key, entry);
  }
  return counts;
};

const [, , a, b, topArg] = process.argv;
const top = Number(topArg ?? 25);
const before = load(a);
const after = load(b);
const rows = [];
for (const [key, entry] of after) {
  const was = before.get(key) ?? { n: 0, bytes: 0 };
  rows.push({ key, dn: entry.n - was.n, dbytes: entry.bytes - was.bytes, n: entry.n });
}
rows.sort((x, y) => y.dbytes - x.dbytes);
console.log("delta count | delta KB | total count | type:name");
for (const row of rows.slice(0, top)) {
  console.log(`${String(row.dn).padStart(11)} | ${(row.dbytes / 1024).toFixed(1).padStart(8)} | ${String(row.n).padStart(11)} | ${row.key}`);
}
