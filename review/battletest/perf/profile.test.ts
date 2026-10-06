// CPU-profiles one workload of one app at N=100 groups: PERF_APP, PERF_WORKLOAD=broadcast|sync|paste|edit|read|add
import fs from "node:fs";
import inspector from "node:inspector";
import path from "node:path";
import { afterEach, describe, it, vi } from "vitest";
import { type DealAdapter, appNames, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi } from "../../stores/support/fakeApi.ts";
import {
  RESULTS_DIR,
  buildGroups,
  flush,
  getEveryCell,
  pasteBatch,
  pasteFields,
  pathOfField,
  productRefs,
  readEveryCell,
  recordCells,
  recordEmits,
  selectedApps,
  sleep,
  turn,
} from "./harness.ts";

const workload = process.env.PERF_WORKLOAD ?? "broadcast";
const groups = Number(process.env.PERF_N ?? 100);
const reps = Number(process.env.PERF_REPS ?? 20);

let adapters: DealAdapter[] = [];
afterEach(() => {
  adapters.forEach((adapter) => adapter.dispose());
  adapters = [];
  vi.unstubAllGlobals();
});

const post = (session: inspector.Session, method: string, params?: object) =>
  new Promise<any>((resolve, reject) => session.post(method, params, (err, result) => (err ? reject(err) : resolve(result))));

describe("profile", () => {
  it.each(selectedApps(appNames))("%s", async (app) => {
    installFakeApi({ Cash: [{ id: 1, name: "A" }], Delivery: [] });
    const adapter = await createAdapter(app);
    adapters.push(adapter);
    const deal = adapter.deal();
    const grid = adapter.grid();
    recordEmits(deal);
    recordCells(grid);
    if (app === "mobx" || app === "mobx-state-tree" || app === "mobx-keystone") {
      const { autorun } = await import("mobx");
      autorun(() => {
        adapter.hasValidationErrors();
        adapter.calc();
      });
    }
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(30);
    buildGroups(deal, groups);
    await flush();
    const refs = productRefs(deal);
    const mid = refs[refs.length >> 1];
    const strikePath = pathOfField(mid, "strike");
    const run = async (i: number) => {
      switch (workload) {
        case "broadcast":
          deal.writePaths([{ path: "strike", value: String(100 + (i % 800)) }]);
          break;
        case "sync":
          deal.writePaths([{ path: "notionalAmount", value: 1000 + i }]);
          break;
        case "paste":
          grid.write(pasteBatch(refs, pasteFields.local, i));
          break;
        case "pasteAll":
          grid.write(pasteBatch(refs, pasteFields.all, i));
          break;
        case "edit":
          deal.writePaths([{ path: strikePath, value: String(100 + (i % 800)) }]);
          break;
        case "read":
          readEveryCell(deal, refs);
          getEveryCell(grid, refs);
          break;
        case "add": {
          deal.addGroup("Strategy");
          const g = deal.getGroups();
          deal.removeGroup(g[g.length - 1].id);
          break;
        }
        default:
          throw new Error(workload);
      }
      await flush();
    };
    for (let i = 0; i < 5; i++) await run(i);
    await turn();
    const session = new inspector.Session();
    session.connect();
    await post(session, "Profiler.enable");
    await post(session, "Profiler.setSamplingInterval", { interval: 100 });
    await post(session, "Profiler.start");
    for (let i = 0; i < reps; i++) await run(100 + i);
    const { profile } = await post(session, "Profiler.stop");
    session.disconnect();
    const dir = path.join(RESULTS_DIR, "prof");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${app}-${workload}-${groups}.cpuprofile`), JSON.stringify(profile));
  }, 10 * 60 * 1000);
});
