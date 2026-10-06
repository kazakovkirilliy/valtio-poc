import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPathGridSource } from "@shared/grid/pathGridSource.ts";
import type { PathDeal } from "@shared/pathDeal.ts";
import { productPath } from "@shared/paths.ts";
import { definitionOfData } from "@shared/products/productWrites.ts";
import { type FakeApi, installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { installFakeDevtools, installLocalStorage, trapConsole } from "./support.ts";

/**
 * Every flow of the app, through the real tab store (with its devtools.ts
 * loaded against a fake extension), under `enforceActions: "always"` with
 * console.warn / console.error trapped: any write outside an action, any
 * MST/keystone liveness or protection warning, shows up as a warning.
 */
const runFlows = async (
  deal: PathDeal,
  api: FakeApi,
  ctl: { calculate(): void; toggleAutocalc(): void; addDeal(): void },
) => {
  const grid = createPathGridSource(deal);
  let repaints = 0;
  const stop = grid.subscribeCells(() => repaints++);
  const groups = () => deal.getGroups();
  const path = (g: number, i: number, fieldId: string) => {
    const productId = groups()[g].productIds[i];
    const fieldPaths = definitionOfData(deal.getProduct(productId)!.data).fieldPaths as Record<string, string>;
    return productPath(groups()[g].id, productId, fieldPaths[fieldId]);
  };

  deal.addGroup("VanillaGroup");
  deal.addGroup("Strategy");
  deal.addGroup("Average");
  deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
  deal.writePaths([{ path: "notionalAmount", value: 1000 }]);
  deal.writePaths([{ path: "ccyPair", value: "EURUSD" }]); // broadcast + deal logic reducer
  deal.writePaths([
    { path: path(1, 0, "strike"), value: "1" },
    { path: path(1, 1, "strike"), value: "2" },
  ]);
  deal.writePaths([{ path: path(0, 0, "expiryDays"), value: 10 }]); // derived, writable
  deal.writePaths([{ path: "deliveryDate", value: "2000-01-01" }]); // date rule
  deal.writePaths([{ path: "settlementStyle", value: "Cash" }]); // async options
  await sleep(30);
  deal.writePaths([{ path: "settlementFixingSource", value: "4" }]);
  deal.writePaths([{ path: "isInternal", value: "false" }, { path: "hedgeType", value: "e" }]);
  deal.cloneGroup(groups()[1].id);
  deal.removeGroup(groups()[0].id);
  api.failing.add("Delivery");
  deal.writePaths([{ path: path(0, 0, "settlementStyle"), value: "Delivery" }]); // a failing load
  deal.writePaths([{ path: productPath(groups()[0].id, groups()[0].productIds[0], "extra.nested"), value: 1 }]);
  deal.writePaths([{ path: "deliveryDate", value: "2999-01-01" }]);
  await sleep(30);
  ctl.calculate();
  ctl.toggleAutocalc();
  ctl.toggleAutocalc();
  await sleep(60);
  // an edit while a calculation is in flight, and a removal while options load
  deal.writePaths([{ path: "notionalAmount", value: 2000 }]);
  deal.writePaths([{ path: path(0, 0, "settlementStyle"), value: "Cash" }]);
  deal.removeGroup(groups()[0].id);
  await sleep(60);
  for (const group of groups()) deal.removeGroup(group.id);
  deal.addGroup("Average");
  ctl.addDeal();
  await sleep(60);
  stop();
  return repaints;
};

const switches = JSON.stringify({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: true });

describe("no write outside an action, in any flow", () => {
  let api: FakeApi;
  let warnings: string[];
  beforeEach(() => {
    vi.resetModules();
    api = installFakeApi({ Cash: [{ id: 4, name: "C4" }, { id: 3, name: "C3" }] });
    installFakeDevtools("?debug");
    vi.spyOn(console, "log").mockImplementation(() => {});
    warnings = trapConsole();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mobx", async () => {
    installLocalStorage({ "mobx-devtools": switches });
    const { configure } = await import("mobx");
    configure({ enforceActions: "always" });
    await import("../../../src-mobx/devtools.ts");
    const { multiTabStore } = await import("../../../src-mobx/stores/multiTabStore.ts");
    const { createPathDeal } = await import("../../../src-mobx/stores/pathDeal.ts");
    multiTabStore.addNewDeal();
    const deal = multiTabStore.deals[multiTabStore.activeDealId];
    const repaints = await runFlows(createPathDeal(deal), api, {
      calculate: () => deal.calculate(),
      toggleAutocalc: () => multiTabStore.devtools.toggleAutocalcEnabled(),
      addDeal: () => multiTabStore.addNewDeal(),
    });
    expect(repaints).toBeGreaterThan(0);
    expect(deal.calc.status).not.toBe("none");
    expect(warnings).toEqual([]);
    for (const open of Object.values(multiTabStore.deals)) open.dispose();
  });

  it("mobx-state-tree", async () => {
    installLocalStorage({ "mobx-state-tree-devtools": switches });
    const { configure } = await import("mobx");
    configure({ enforceActions: "always" });
    await import("../../../src-mobx-state-tree/devtools.ts");
    const { multiTabStore, devtools } = await import("../../../src-mobx-state-tree/stores/multiTabStore.ts");
    const { createPathDeal } = await import("../../../src-mobx-state-tree/stores/pathDeal.ts");
    multiTabStore.addNewDeal();
    const deal = multiTabStore.deals[0];
    const repaints = await runFlows(createPathDeal(deal), api, {
      calculate: () => deal.calculate(),
      toggleAutocalc: () => devtools.toggleAutocalcEnabled(),
      addDeal: () => multiTabStore.addNewDeal(),
    });
    expect(repaints).toBeGreaterThan(0);
    expect(deal.calc.status).not.toBe("none");
    expect(warnings).toEqual([]);
  });

  it("mobx-keystone", async () => {
    installLocalStorage({ "mobx-keystone-devtools": switches });
    const { configure } = await import("mobx");
    configure({ enforceActions: "always" });
    const { setGlobalConfig } = await import("mobx-keystone");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    await import("../../../src-mobx-keystone/devtools.ts");
    const { multiTabStore } = await import("../../../src-mobx-keystone/stores/multiTabStore.ts");
    const { createPathDeal } = await import("../../../src-mobx-keystone/stores/pathDeal.ts");
    multiTabStore.addNewDeal();
    const deal = multiTabStore.deals[0];
    const repaints = await runFlows(createPathDeal(deal), api, {
      calculate: () => deal.calculate(),
      toggleAutocalc: () => multiTabStore.devtools.toggleAutocalcEnabled(),
      addDeal: () => multiTabStore.addNewDeal(),
    });
    expect(repaints).toBeGreaterThan(0);
    expect(deal.calc.status).not.toBe("none");
    expect(warnings).toEqual([]);
  });
});
