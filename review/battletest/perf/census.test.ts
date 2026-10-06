// Writes two heap snapshots of one app (PERF_APP, PERF_MODE=headless|grid) around N add/clone/remove cycles
// into PERF_SNAP_DIR, for heapdiff.mjs. Not part of the numbers in the report.
import fs from "node:fs";
import path from "node:path";
import v8 from "node:v8";
import { afterEach, describe, it, vi } from "vitest";
import { type DealAdapter, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi } from "../../stores/support/fakeApi.ts";
import { buildGroups, flush, gc, pathOfField, productRefs, recordCells, recordEmits, sleep, turn } from "./harness.ts";

const app = (process.env.PERF_APP ?? "legend-state") as Parameters<typeof createAdapter>[0];
const mode = process.env.PERF_MODE ?? "headless";
const dir = process.env.PERF_SNAP_DIR ?? "/tmp";
const cycles = Number(process.env.PERF_CYCLES ?? 100);

let adapters: DealAdapter[] = [];
afterEach(() => {
  adapters.forEach((adapter) => adapter.dispose());
  adapters = [];
  vi.unstubAllGlobals();
});

describe("census", () => {
  it(`${app} ${mode}`, async () => {
    installFakeApi({ Cash: [{ id: 1, name: "A" }], Delivery: [] });
    const adapter = await createAdapter(app);
    adapters.push(adapter);
    const deal = adapter.deal();
    if (mode === "grid") {
      recordCells(adapter.grid());
      recordEmits(deal);
    }
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(30);
    buildGroups(deal, 10);
    await flush();
    const cycle = async (i: number) => {
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
      deal.writePaths(refs.map((ref) => ({ path: pathOfField(ref, "expiryDate"), value: "2031-02-12" })));
      await flush();
      deal.removeGroup(clone.id);
      deal.removeGroup(added.id);
      await flush();
    };
    for (let i = 0; i < 30; i++) await cycle(i);
    await turn();
    gc();
    fs.mkdirSync(dir, { recursive: true });
    v8.writeHeapSnapshot(path.join(dir, `${app}-${mode}-a.heapsnapshot`));
    for (let i = 0; i < cycles; i++) await cycle(i);
    await turn();
    gc();
    v8.writeHeapSnapshot(path.join(dir, `${app}-${mode}-b.heapsnapshot`));
  }, 10 * 60 * 1000);
});
