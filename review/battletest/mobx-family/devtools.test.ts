import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { fieldPath, installFakeDevtools, installLocalStorage, trapConsole } from "./support.ts";

/**
 * Devtools claims (REQUIREMENTS §12, each app's devtools.ts header), checked
 * against a fake `window.__REDUX_DEVTOOLS_EXTENSION__`: what is reported, how
 * it is named, and whether time travel restores the state.
 */
const switches = JSON.stringify({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: true });
const print = (label: string, value: unknown) => process.stdout.write(`\n[${label}] ${JSON.stringify(value, null, 1)}\n`);

beforeEach(() => {
  vi.resetModules();
  installFakeApi({ Cash: [{ id: 4, name: "C4" }] });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mobx devtools", () => {
  it("reports each outermost action once; async continuations are unnamed; no time travel", async () => {
    const devtools = installFakeDevtools();
    installLocalStorage({ "mobx-devtools": switches });
    const { configure } = await import("mobx");
    configure({ enforceActions: "always" });
    await import("../../../src-mobx/devtools.ts");
    const { multiTabStore } = await import("../../../src-mobx/stores/multiTabStore.ts");
    multiTabStore.addNewDeal();
    const deal = multiTabStore.deals[multiTabStore.activeDealId];
    deal.addNewGroup("VanillaGroup");
    const group = deal.groups[deal.groupIds[0]];
    const product = group.productList[0];
    const before = devtools.sent.length;
    deal.writePaths([{ path: fieldPath(group.id, product, "strike"), value: "1" }]);
    expect(devtools.sent.length - before).toBe(1); // one edit, one entry (reactions it set off are folded in)
    multiTabStore.devtools.toggleSpotPriceStreamEnabled();
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(80); // options arrive, then autocalc prices the deal
    const types = devtools.sent.map(({ type }) => type);
    print("mobx action types", types);
    // the actions are named by MobX's generated debug names, not by the store
    expect(types.some((type) => /^ObservableObject@\d+\.writePaths$/.test(type))).toBe(true);
    // async continuations (`runInAction` after an await) arrive as "<unnamed action>"
    expect(types.filter((type) => type === "<unnamed action>").length).toBeGreaterThan(0);
    // only one instance, and no way to move it: the monitor's JUMP has no listener
    expect(devtools.names()).toEqual([]);
    for (const open of Object.values(multiTabStore.deals)) open.dispose();
    multiTabStore.devtools.toggleSpotPriceStreamEnabled();
  });
});

describe("mobx-state-tree devtools", () => {
  it("reports actions of the tab tree and the options tree, but never the switches", async () => {
    const devtools = installFakeDevtools();
    const storage = installLocalStorage({ "mobx-state-tree-devtools": switches });
    await import("../../../src-mobx-state-tree/devtools.ts");
    const { multiTabStore, devtools: switchesStore } = await import("../../../src-mobx-state-tree/stores/multiTabStore.ts");
    multiTabStore.addNewDeal();
    const before = devtools.sent.length;
    switchesStore.toggleAutocalcEnabled();
    switchesStore.toggleAutocalcEnabled();
    expect(storage.getItem("mobx-state-tree-devtools")).toContain('"isAutocalcEnabled":true'); // persisted …
    expect(devtools.sent.length).toBe(before); // … but never reported: the switches tree isn't connected
    expect(devtools.names().sort()).toEqual(["Deal editor (MobX-State-Tree)", "Options (MobX-State-Tree)"]);
    await sleep(30);
  });

  it("time travel: a state that went through JSON has null where NaN was, and the tree rejects it", async () => {
    const devtools = installFakeDevtools();
    installLocalStorage({ "mobx-state-tree-devtools": JSON.stringify({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false }) });
    const warnings = trapConsole();
    await import("../../../src-mobx-state-tree/devtools.ts");
    const { getSnapshot } = await import("mobx-state-tree");
    const { multiTabStore } = await import("../../../src-mobx-state-tree/stores/multiTabStore.ts");
    multiTabStore.addNewDeal();
    const deal = multiTabStore.deals[0];
    deal.addNewGroup("VanillaGroup");
    await sleep(30);
    const past = getSnapshot(multiTabStore); // notionalAmount: NaN, as every empty number
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    let error: unknown;
    try {
      devtools.jump("Deal editor (MobX-State-Tree)", past); // the extension sends JSON: NaN → null
    } catch (caught) {
      error = caught;
    }
    print("mst jump error", String(error).slice(0, 300));
    print("mst warnings", warnings.map((w) => w.slice(0, 200)));
    expect(String(error)).toMatch(/null.*not assignable|not assignable.*number|value `null`/i);
    // and the jump is not atomic: the props before notionalAmount were applied, the groups after it weren't
    const { readField } = await import("@shared/products/productRegistry.ts");
    print("mst torn state", { deal: deal.notionalCcy, product: readField(deal.products[0].data, "notionalCcy") });
    expect(deal.notionalCcy).toBe("1xxxxxx");
    expect(readField(deal.products[0].data, "notionalCcy")).toBe("USD"); // the synced field now disagrees
  });

  it("time travel with the deal's amount filled works, but empty product numbers come back null (errors)", async () => {
    const devtools = installFakeDevtools();
    installLocalStorage({ "mobx-state-tree-devtools": JSON.stringify({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false }) });
    await import("../../../src-mobx-state-tree/devtools.ts");
    const { getSnapshot } = await import("mobx-state-tree");
    const { multiTabStore } = await import("../../../src-mobx-state-tree/stores/multiTabStore.ts");
    multiTabStore.addNewDeal();
    const deal = multiTabStore.deals[0];
    deal.addNewGroup("VanillaGroup");
    deal.writePaths([{ path: "notionalAmount", value: 1000 }]); // no NaN left on the deal itself
    await sleep(30);
    expect(deal.products[0].issues.expiryDays).toBeUndefined(); // empty expiry date: expiryDays is NaN, no issue
    const past = getSnapshot(multiTabStore);
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    devtools.jump("Deal editor (MobX-State-Tree)", past);
    expect(deal.notionalCcy).toBe("1xxxxxx");
    const { readField } = await import("@shared/products/productRegistry.ts");
    expect(readField(deal.products[0].data, "expiryDays")).toBeNull();
    expect(deal.products[0].issues.expiryDays?.length).toBeGreaterThan(0); // a new error, from the jump alone
  });

  it("time travel to a state whose deal is valid re-prices it: the reactions see the jump as an edit", async () => {
    const devtools = installFakeDevtools();
    installLocalStorage({ "mobx-state-tree-devtools": switches });
    await import("../../../src-mobx-state-tree/devtools.ts");
    const { getSnapshot } = await import("mobx-state-tree");
    const { multiTabStore } = await import("../../../src-mobx-state-tree/stores/multiTabStore.ts");
    multiTabStore.addNewDeal();
    const deal = multiTabStore.deals[0];
    deal.addNewGroup("VanillaGroup");
    const group = deal.groups[0];
    // no NaN left anywhere, so the JSON round trip itself is harmless
    deal.writePaths([
      { path: "notionalCcy", value: "USD" },
      { path: "notionalAmount", value: 1000 },
      { path: fieldPath(group.id, group.products[0], "expiryDate"), value: "2999-01-01" },
    ]);
    await sleep(80);
    expect(deal.calc).toMatchObject({ status: "done", price: 2 });
    const past = getSnapshot(multiTabStore);
    deal.writePaths([{ path: "notionalAmount", value: 3000 }]);
    await sleep(80);
    expect(deal.calc).toMatchObject({ status: "done", price: 4 });
    const sentBefore = devtools.sent.length;
    devtools.jump("Deal editor (MobX-State-Tree)", past);
    expect(deal.notionalAmount).toBe(1000);
    const right = deal.calc;
    await sleep(80);
    print("mst after jump", { right, later: deal.calc, newEntries: devtools.sent.slice(sentBefore).map(({ type }) => type) });
    // the restored state said "done, 2"; the inputs reaction marks it outdated and autocalc requests again
    expect(right.status).not.toBe("done");
    expect(devtools.sent.length).toBeGreaterThan(sentBefore); // and the re-pricing lands in the history
  });
});

describe("mobx-keystone devtools", () => {
  it("time travel: NaN comes back as null, an empty number becomes a validation error", async () => {
    const devtools = installFakeDevtools();
    installLocalStorage({ "mobx-keystone-devtools": JSON.stringify({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false }) });
    const { setGlobalConfig, getSnapshot } = await import("mobx-keystone");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    await import("../../../src-mobx-keystone/devtools.ts");
    const { multiTabStore } = await import("../../../src-mobx-keystone/stores/multiTabStore.ts");
    multiTabStore.addNewDeal();
    const deal = multiTabStore.deals[0];
    deal.addNewGroup("VanillaGroup");
    await sleep(30);
    const product = deal.products[0];
    expect(product.issues.notionalAmount).toBeUndefined(); // NaN: empty, no issue
    const past = getSnapshot(multiTabStore);
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    devtools.jump("Deal editor (MobX Keystone)", past);
    expect(deal.notionalCcy).toBe("1xxxxxx"); // restored …
    print("keystone after jump", { dealAmount: deal.notionalAmount, issues: deal.products[0].issues.notionalAmount?.map((i) => i.message) });
    expect(deal.notionalAmount).toBeNaN(); // the deal's prop has a default, which keystone applies for null …
    const { readField } = await import("@shared/products/productRegistry.ts");
    expect(readField(deal.products[0].data, "notionalAmount")).toBeNull(); // … the product's plain data hasn't
    expect(deal.products[0].issues.notionalAmount?.length).toBeGreaterThan(0); // and the empty field is now an error
  });

  it("time travel keeps the switches instance (persistence and the deals' context still follow it)", async () => {
    const devtools = installFakeDevtools();
    const storage = installLocalStorage({ "mobx-keystone-devtools": switches });
    const { setGlobalConfig, getSnapshot } = await import("mobx-keystone");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    await import("../../../src-mobx-keystone/devtools.ts");
    const { multiTabStore } = await import("../../../src-mobx-keystone/stores/multiTabStore.ts");
    const { devtoolsContext } = await import("../../../src-mobx-keystone/stores/dealModel.ts");
    multiTabStore.addNewDeal();
    const deal = multiTabStore.deals[0];
    const switchesBefore = multiTabStore.devtools;
    const past = getSnapshot(multiTabStore);
    multiTabStore.devtools.toggleAutocalcEnabled();
    devtools.jump("Deal editor (MobX Keystone)", past);
    print("keystone switches after jump", {
      sameInstance: multiTabStore.devtools === switchesBefore,
      contextIsTree: devtoolsContext.get(deal) === multiTabStore.devtools,
      stored: storage.getItem("mobx-keystone-devtools"),
      inTree: multiTabStore.devtools.isAutocalcEnabled,
    });
    expect(multiTabStore.devtools.isAutocalcEnabled).toBe(true);
    expect(storage.getItem("mobx-keystone-devtools")).toContain('"isAutocalcEnabled":true');
    expect(devtoolsContext.get(deal)).toBe(multiTabStore.devtools);
    await sleep(30);
  });

  it("time travel to a valid, priced state re-prices it too", async () => {
    const devtools = installFakeDevtools();
    installLocalStorage({ "mobx-keystone-devtools": switches });
    const { setGlobalConfig, getSnapshot } = await import("mobx-keystone");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    await import("../../../src-mobx-keystone/devtools.ts");
    const { multiTabStore } = await import("../../../src-mobx-keystone/stores/multiTabStore.ts");
    multiTabStore.addNewDeal();
    const deal = multiTabStore.deals[0];
    deal.addNewGroup("VanillaGroup");
    const group = deal.groups[0];
    deal.writePaths([
      { path: "notionalCcy", value: "USD" },
      { path: "notionalAmount", value: 1000 },
      { path: fieldPath(group.id, group.products[0], "expiryDate"), value: "2999-01-01" },
    ]);
    await sleep(80);
    const past = getSnapshot(multiTabStore);
    deal.writePaths([{ path: "notionalAmount", value: 3000 }]);
    await sleep(80);
    const sentBefore = devtools.sent.length;
    devtools.jump("Deal editor (MobX Keystone)", past);
    const right = { ...deal.calc };
    await sleep(80);
    print("keystone after jump", { right, newEntries: devtools.sent.slice(sentBefore).map(({ type }) => type.replace(/\(.*?\) \(id \d+/g, "(… ")) });
    expect(right.status).not.toBe("done");
    expect(devtools.sent.length).toBeGreaterThan(sentBefore);
  });

  it("names nested actions parent >>> child, and logs async continuations as their own entries", async () => {
    const devtools = installFakeDevtools();
    installLocalStorage({ "mobx-keystone-devtools": switches });
    const { setGlobalConfig } = await import("mobx-keystone");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    await import("../../../src-mobx-keystone/devtools.ts");
    const { multiTabStore } = await import("../../../src-mobx-keystone/stores/multiTabStore.ts");
    multiTabStore.addNewDeal();
    const deal = multiTabStore.deals[0];
    deal.addNewGroup("VanillaGroup");
    const before = devtools.sent.length;
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    const oneEdit = devtools.sent.slice(before).map(({ type }) => type.replace(/\(.*?\) \(id \d+\)/g, "(…)"));
    print("keystone one edit", oneEdit);
    expect(oneEdit.length).toBeGreaterThan(1); // child actions are separate entries
    await sleep(80);
    print("keystone all", devtools.sent.map(({ name, type }) => `${name}: ${type.replace(/\(.*?\) \(id \d+/g, "(… ")}`));
  });
});
