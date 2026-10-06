// node retainers.mjs snapshot "<type>:<name>" [count] -> shortest retaining path(s) from the GC roots to the newest nodes with that type:name
import fs from "node:fs";

const [, , file, pattern, countArg] = process.argv;
const count = Number(countArg ?? 1);
const snap = JSON.parse(fs.readFileSync(file, "utf8"));
const nf = snap.snapshot.meta.node_fields;
const ef = snap.snapshot.meta.edge_fields;
const NF = nf.length;
const EF = ef.length;
const iType = nf.indexOf("type");
const iName = nf.indexOf("name");
const iId = nf.indexOf("id");
const iEdgeCount = nf.indexOf("edge_count");
const nodeTypes = snap.snapshot.meta.node_types[0];
const edgeTypes = snap.snapshot.meta.edge_types[0];
const eType = ef.indexOf("type");
const eName = ef.indexOf("name_or_index");
const eTo = ef.indexOf("to_node");
const N = snap.nodes.length / NF;
const firstEdge = new Uint32Array(N + 1);
for (let i = 0, e = 0; i < N; i++) {
  firstEdge[i] = e;
  e += snap.nodes[i * NF + iEdgeCount];
}
firstEdge[N] = snap.edges.length / EF;
const label = (i) => `${nodeTypes[snap.nodes[i * NF + iType]]}:${snap.strings[snap.nodes[i * NF + iName]]}`;

// BFS from the root, skipping weak edges
const parent = new Int32Array(N).fill(-1);
const parentEdge = new Int32Array(N).fill(-1);
const seen = new Uint8Array(N);
const queue = [0];
seen[0] = 1;
for (let q = 0; q < queue.length; q++) {
  const from = queue[q];
  for (let e = firstEdge[from]; e < firstEdge[from + 1]; e++) {
    const type = edgeTypes[snap.edges[e * EF + eType]];
    if (type === "weak") continue;
    const to = snap.edges[e * EF + eTo] / NF;
    if (seen[to]) continue;
    seen[to] = 1;
    parent[to] = from;
    parentEdge[to] = e;
    queue.push(to);
  }
}
const matches = [];
for (let i = 0; i < N; i++) if (seen[i] && label(i) === pattern) matches.push(i);
matches.sort((a, b) => snap.nodes[b * NF + iId] - snap.nodes[a * NF + iId]);
console.log(`${matches.length} reachable nodes of ${pattern}`);
for (const target of matches.slice(0, count)) {
  const path = [];
  for (let n = target; n !== -1; n = parent[n]) {
    const e = parentEdge[n];
    let edge = "";
    if (e !== -1) {
      const type = edgeTypes[snap.edges[e * EF + eType]];
      const raw = snap.edges[e * EF + eName];
      edge = `${type}:${type === "element" || type === "hidden" ? raw : snap.strings[raw]}`;
    }
    path.push(`${edge} -> ${label(n)}`);
  }
  console.log("---- path (root first)");
  console.log(path.reverse().join("\n"));
}
