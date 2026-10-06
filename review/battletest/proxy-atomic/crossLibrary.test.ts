import { afterEach, describe, expect, it, vi } from "vitest";
import type { DealChange } from "@shared/pathDeal.ts";
import type { ProductFieldId } from "@shared/fields.ts";
import { type ProductData, readField } from "@shared/products/productRegistry.ts";
import { type AppName, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { at } from "./support.ts";

/**
 * The four proxy/atomic apps, driven the same way (through `PathDeal`), on
 * claims the shared suites don't pin down.
 */
const apps: AppName[] = ["valtio", "legend-state", "zustand", "jotai"];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock(at("src-shared/api/calculate.ts"));
});

/** A plain deep copy that keeps NaN (unlike JSON) and works on proxies (unlike structuredClone). */
const deepCopy = (value: unknown): unknown =>
  typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, deepCopy(inner)]))
    : value;

describe.each(apps)("%s: an object written at a path that isn't a field (P4)", (app) => {
  it("its fields still validate, still notify the grid, and later leaf edits still count", async () => {
    installFakeApi();
    const adapter = await createAdapter(app);
    const deal = adapter.deal();
    deal.addGroup("VanillaGroup");
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]); // the deal is valid now
    const [group] = deal.getGroups();
    const productId = group.productIds[0];
    const base = `groups.${group.id}.products.${productId}.data`;
    const changes: DealChange[] = [];
    const stop = deal.subscribe((change) => changes.push(change));
    const step = async (path: string, value: unknown) => {
      changes.length = 0;
      deal.writePaths([{ path, value }]);
      await sleep(5);
      return {
        strike: deal.readPath(`${base}.optionsCommon.strike`),
        issues: deal.fieldIssues(productId, "strike" as ProductFieldId).map(({ message }) => message),
        hasValidationErrors: adapter.hasValidationErrors(),
        gridNotified: changes.some((change) => change.kind === "products" && change.ids.includes(productId)),
      };
    };
    expect(adapter.hasValidationErrors()).toBe(false);

    const copy = deepCopy(deal.readPath(`${base}.optionsCommon`)) as Record<string, unknown>;
    copy.strike = "TOOLONG";
    const objectWrite = await step(`${base}.optionsCommon`, copy);
    const leafValid = await step(`${base}.optionsCommon.strike`, "1");
    const leafInvalid = await step(`${base}.optionsCommon.strike`, "1234");
    stop();
    adapter.dispose();
    console.log(`[P4 object write] ${app}`, JSON.stringify({ objectWrite, leafValid, leafInvalid }));

    // the value always lands
    expect([objectWrite.strike, leafValid.strike, leafInvalid.strike]).toEqual(["TOOLONG", "1", "1234"]);
    if (app === "valtio") {
      // BUG: the validation and grid subscriptions were bound to the replaced `optionsCommon` proxy
      expect(objectWrite).toMatchObject({ issues: [], hasValidationErrors: false, gridNotified: false });
      expect(leafInvalid).toMatchObject({ issues: [], hasValidationErrors: false, gridNotified: false });
    } else {
      expect(objectWrite).toMatchObject({ issues: ["Must be at most 3 characters"], hasValidationErrors: true, gridNotified: true });
      expect(leafValid).toMatchObject({ issues: [], hasValidationErrors: false, gridNotified: true });
      expect(leafInvalid).toMatchObject({ issues: ["Must be at most 3 characters"], hasValidationErrors: true, gridNotified: true });
    }
  });
});

describe.each(apps)("%s: options arriving while autocalc is on", (app) => {
  it("counts the calculations a clone's options reload starts, and what each priced", async () => {
    const calls: unknown[][] = [];
    vi.doMock(at("src-shared/api/calculate.ts"), async () => {
      const actual = await vi.importActual<typeof import("@shared/api/calculate.ts")>(at("src-shared/api/calculate.ts"));
      return {
        calculatePrice: (products: readonly ProductData[]) => {
          calls.push(products.map((data) => readField(data, "settlementFixingSource")));
          return actual.calculatePrice(products);
        },
      };
    });
    const api = installFakeApi({ Cash: [{ id: 3, name: "Shared" }, { id: 4, name: "C4" }] });
    const adapter = await createAdapter(app);
    adapter.setAutocalc(true);
    const deal = adapter.deal();
    deal.addGroup("VanillaGroup");
    const [group] = deal.getGroups();
    const productId = group.productIds[0];
    deal.writePaths([
      { path: "notionalCcy", value: "USD" },
      { path: `groups.${group.id}.products.${productId}.data.settlementStyle`, value: "Cash" },
    ]);
    await sleep(80);
    expect(adapter.calc().status).toBe("done");
    api.lists.Cash = [{ id: 4, name: "C4" }]; // 3 is no longer offered
    calls.length = 0;

    deal.cloneGroup(group.id); // the copy, still on 3, reloads Cash's options
    await sleep(80);
    const fixings = deal.getGroups().map(({ productIds }) => readField(deal.getProduct(productIds[0])!.data, "settlementFixingSource"));
    adapter.dispose();
    console.log(`[options → autocalc] ${app}: ${calls.length} calculation(s), priced fixings ${JSON.stringify(calls)}`);

    expect(fixings).toEqual(["4", "4"]);
    expect(adapter.calc().status).toBe("done");
    if (app === "zustand" || app === "jotai") {
      expect(calls).toEqual([["4", "4"]]); // one, on the reconciled data
    } else {
      // valtio, legend-state: the load counts as done before the products reconcile,
      // so autocalc prices the stale "3" first, then again once they reconcile
      expect(calls).toEqual([["3", "3"], ["4", "4"]]);
    }
  });
});

describe.each(apps)("%s: notification scope through PathDeal.subscribe", (app) => {
  it("counts the DealChange events a deal emits per kind of write", async () => {
    installFakeApi();
    const adapter = await createAdapter(app);
    const deal = adapter.deal();
    deal.addGroup("Strategy");
    deal.addGroup("Strategy");
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(20);
    const [first] = deal.getGroups();
    const productId = first.productIds[0];
    const base = `groups.${first.id}.products.${productId}.data`;
    const changes: DealChange[] = [];
    const stop = deal.subscribe((change) => changes.push(change));
    const measure = async (writes: { path: string; value: unknown }[]) => {
      changes.length = 0;
      deal.writePaths(writes);
      await sleep(5);
      const productEvents = changes.filter((change) => change.kind === "products");
      return {
        events: changes.length,
        productEvents: productEvents.length,
        productIdsReported: productEvents.reduce((sum, change) => sum + (change.kind === "products" ? change.ids.length : 0), 0),
      };
    };
    const result = {
      oneCell: await measure([{ path: `${base}.optionsCommon.strike`, value: "1" }]),
      pasteThreeCellsOneProduct: await measure([
        { path: `${base}.optionsCommon.strike`, value: "2" },
        { path: `${base}.optionsCommon.callPut`, value: "Call" },
        { path: `${base}.optionsCommon.base.expiryCut`, value: "TK" },
      ]),
      broadcastToFourProducts: await measure([{ path: "strike", value: "9" }]),
      syncedFieldFourProducts: await measure([{ path: "notionalAmount", value: 1000 }]),
      invalidEdit: await measure([{ path: `${base}.optionsCommon.strike`, value: "1234" }]),
    };
    stop();
    adapter.dispose();
    console.log(`[notification scope] ${app}`, JSON.stringify(result));
    // every app reports the edited product at least once
    expect(result.oneCell.productIdsReported).toBeGreaterThanOrEqual(1);
    if (app === "valtio") {
      // one subscribeKey per field: a three-cell paste is three events for one product
      expect(result.pasteThreeCellsOneProduct.productEvents).toBe(3);
    } else {
      expect(result.pasteThreeCellsOneProduct.productEvents).toBe(1);
    }
  });
});

describe.each([100, 400])("many groups (%i Strategy groups): write cost per app", (groupCount) => {
  it("times adding the groups, 100 single edits, a broadcast to every product and removing everything (grid subscribed, autocalc off)", async () => {
    const rows: Record<string, Record<string, number>> = {};
    for (const app of apps) {
      installFakeApi();
      const adapter = await createAdapter(app);
      const deal = adapter.deal();
      const stop = deal.subscribe(() => {});
      const time = async (run: () => void) => {
        const start = performance.now();
        run();
        await sleep(0); // let async notifications (valtio) run
        return Math.round((performance.now() - start) * 10) / 10;
      };
      const add = await time(() => {
        for (let i = 0; i < groupCount; i++) deal.addGroup("Strategy");
      });
      const groups = deal.getGroups();
      const edits = await time(() => {
        for (let i = 0; i < 100; i++) {
          const group = groups[i];
          deal.writePaths([{ path: `groups.${group.id}.products.${group.productIds[0]}.data.optionsCommon.strike`, value: String(i % 10) }]);
        }
      });
      const broadcast = await time(() => deal.writePaths([{ path: "expiryCut", value: "NY10" }]));
      const remove = await time(() => {
        for (const group of groups) deal.removeGroup(group.id);
      });
      stop();
      adapter.dispose();
      vi.unstubAllGlobals();
      rows[app] = { addGroups: add, edits100: edits, broadcast: broadcast, removeAll: remove };
      expect(deal.getGroups()).toHaveLength(0);
    }
    console.log(`[many groups: ${groupCount} groups / ${groupCount * 2} products, ms]`, JSON.stringify(rows));
  }, 120_000);
});
