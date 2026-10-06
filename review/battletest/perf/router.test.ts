// The shared write router on a 13-field paste over 133 products: how many product writes it plans, how long it takes
// alone (no store), and what dropping repeated same-value synced writes would save. Read-only use of src-shared.
import { afterEach, describe, expect, it, vi } from "vitest";
import { routeWrites } from "@shared/dealWrites.ts";
import { initialDealFields } from "@shared/dealFields.ts";
import { initialDealSettings } from "@shared/dealSettings.ts";
import { type PathWrite } from "@shared/paths.ts";
import { planProductWrites } from "@shared/products/productWrites.ts";
import { type DealAdapter, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi } from "../../stores/support/fakeApi.ts";
import { buildGroups, median, pasteFields, pasteValue, pathOfField, productRefs } from "./harness.ts";

let adapters: DealAdapter[] = [];
afterEach(() => {
  adapters.forEach((a) => a.dispose());
  adapters = [];
  vi.unstubAllGlobals();
});

describe("router", () => {
  it("paste of 13 fields x 133 products", async () => {
    installFakeApi({ Cash: [{ id: 1, name: "A" }], Delivery: [] });
    const adapter = await createAdapter("zustand");
    adapters.push(adapter);
    const deal = adapter.deal();
    buildGroups(deal, 100);
    const refs = productRefs(deal);
    const products = refs.map((ref) => ({ groupId: ref.groupId, productId: ref.productId, data: deal.getProduct(ref.productId)!.data }));
    const state = { dealFields: { ...initialDealFields }, settings: { ...initialDealSettings }, products };
    const writes: PathWrite[] = pasteFields.all.flatMap((fieldId) =>
      refs.flatMap((ref, p) => (fieldId in ref.fieldPaths ? [{ path: pathOfField(ref, fieldId), value: pasteValue(fieldId, 1, p) }] : [])),
    );
    const time = (fn: () => void, n = 5) => {
      fn();
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = performance.now();
        fn();
        xs.push(performance.now() - t);
      }
      return median(xs);
    };
    let planned = 0;
    const route = (input: PathWrite[]) => {
      const routed = routeWrites(state, input);
      planned = [...routed.products.values()].reduce((n, p) => n + p.writes.length, 0);
      return routed;
    };
    const routeMs = time(() => route(writes));
    const plannedFull = planned;
    const planMs = time(() => {
      const routed = route(writes);
      for (const [productId, { writes: w }] of routed.products) planProductWrites(products.find((p) => p.productId === productId)!.data, w);
    });
    // the same batch with each repeated identical synced write dropped (a synced field is already everywhere after the first)
    const seen = new Set<string>();
    const deduped = writes.filter(({ path, value }) => {
      const key = path.split(".").slice(-1)[0];
      if (!["notionalCcy", "notionalAmount", "premiumCcy"].includes(key) && !["notionalCcy", "notionalAmount", "premiumCcy"].includes(path)) return true;
      const k = `${key}=${String(value)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const dedupMs = time(() => {
      const routed = route(deduped);
      for (const [productId, { writes: w }] of routed.products) planProductWrites(products.find((p) => p.productId === productId)!.data, w);
    });
    console.log(`ROUTER grid writes=${writes.length} planned product writes=${plannedFull} routeWrites=${routeMs.toFixed(1)}ms route+plan=${planMs.toFixed(1)}ms; after dropping repeated synced writes: writes=${deduped.length} planned=${planned} route+plan=${dedupMs.toFixed(1)}ms`);
    expect(plannedFull).toBeGreaterThan(0);
  }, 120000);
});
