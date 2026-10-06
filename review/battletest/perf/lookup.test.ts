// What one read costs as the deal grows: getProduct / readPath / fieldIssues / getCell for the first and the LAST product
// (most apps find a product by scanning the groups). microseconds per call, median of 5 batches of 2000 calls.
import { afterEach, describe, it, vi } from "vitest";
import { type DealAdapter, appNames, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi } from "../../stores/support/fakeApi.ts";
import { buildGroups, flush, gc, median, pathOfField, productRefs, selectedApps, sleep, writeResults } from "./harness.ts";

let adapters: DealAdapter[] = [];
afterEach(() => {
  adapters.forEach((adapter) => adapter.dispose());
  adapters = [];
  vi.unstubAllGlobals();
});

const perCall = (fn: () => void, calls = 2000, batches = 5) => {
  for (let i = 0; i < 200; i++) fn();
  const times: number[] = [];
  for (let b = 0; b < batches; b++) {
    const t0 = performance.now();
    for (let i = 0; i < calls; i++) fn();
    times.push(((performance.now() - t0) * 1000) / calls);
  }
  return median(times);
};

describe("lookup", () => {
  it.each(selectedApps(appNames))("%s", async (app) => {
    const out: Record<string, unknown> = {};
    for (const groups of [10, 50, 100]) {
      installFakeApi({ Cash: [{ id: 1, name: "A" }], Delivery: [] });
      const adapter = await createAdapter(app);
      adapters.push(adapter);
      const deal = adapter.deal();
      const grid = adapter.grid();
      if (app === "mobx" || app === "mobx-state-tree" || app === "mobx-keystone") {
        const { autorun } = await import("mobx");
        autorun(() => {
          adapter.hasValidationErrors();
        });
      }
      deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
      await sleep(30);
      buildGroups(deal, groups);
      await flush();
      const refs = productRefs(deal);
      const first = refs[0];
      const last = refs[refs.length - 1];
      gc();
      const row: Record<string, number> = {};
      for (const [name, ref] of [["first", first], ["last", last]] as const) {
        row[`getProduct.${name}`] = perCall(() => deal.getProduct(ref.productId));
        row[`readPath.${name}`] = perCall(() => deal.readPath(pathOfField(ref, "strike")));
        row[`fieldIssues.${name}`] = perCall(() => deal.fieldIssues(ref.productId, "strike"));
        row[`getCell.${name}`] = perCall(() => grid.getCell(ref.productId, "strike"));
      }
      row["getColumns"] = perCall(() => grid.getColumns(), 200, 5);
      out[groups] = { products: refs.length, ...row };
      adapter.dispose();
      adapters = [];
    }
    writeResults(`lookup-${app}`, out);
  }, 10 * 60 * 1000);
});
