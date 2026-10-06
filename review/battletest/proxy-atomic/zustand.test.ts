import { afterEach, describe, expect, it, vi } from "vitest";
import { productPath } from "@shared/paths.ts";
import { definitionOf, productTypeOf } from "@shared/products/productRegistry.ts";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { at, forceGc, installFakeExtension, installLocalStorage } from "./support.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock(at("src-shared/validation.ts"));
});

type ZDeal = Awaited<ReturnType<typeof importApp>>["deal"];

/** The real app modules (tabs, switches, options), with the fake extension installed first. */
const importApp = async (storage: Record<string, string> = {}, switches = { isSpotPriceStreamEnabled: false, isAutocalcEnabled: false }) => {
  installFakeApi();
  const extension = installFakeExtension();
  const { data } = installLocalStorage(storage);
  vi.resetModules();
  const { multiTabStore, devtoolsStore } = await import("../../../src-zustand/stores/multiTabStore.ts");
  const { selectHasValidationErrors, issuesOf } = await import("../../../src-zustand/stores/validation.ts");
  const hydrated = devtoolsStore.getState();
  devtoolsStore.setState(switches);
  multiTabStore.getState().actions.addNewDeal();
  const { deals, activeDealId } = multiTabStore.getState();
  const deal = deals[activeDealId];
  return { extension, data, multiTabStore, devtoolsStore, deal, hydrated, selectHasValidationErrors, issuesOf };
};

const firstProduct = (deal: ZDeal, groupIndex = 0) => {
  const { groupIds, groups } = deal.getState();
  const group = groups[groupIds[groupIndex]];
  const productId = group.productIds[0];
  const data = group.products[productId].data;
  const pathOf = (fieldId: string) =>
    productPath(group.id, productId, (definitionOf(productTypeOf(data)).fieldPaths as Record<string, string>)[fieldId]);
  return { groupId: group.id, productId, data, pathOf };
};

describe("zustand: Redux DevTools time travel (devtools middleware, serialize.replacer)", () => {
  it("a JUMP restores the data and keeps the actions, but empty numbers come back null: the deal turns invalid", async () => {
    const app = await importApp();
    const { deal, extension, selectHasValidationErrors, issuesOf } = app;
    const connection = extension.byName("Deal 1 (Zustand)")!;
    const { actions } = deal.getState();
    actions.addNewGroup("VanillaGroup");
    actions.writePaths([{ path: "notionalCcy", value: "USD" }]); // valid from here
    await sleep(20);
    const validIndex = connection.sends.findLastIndex(({ action }) => action.type === "writePaths");
    const recorded = JSON.parse(connection.sends[validIndex].state);
    expect(recorded.actions).toBeUndefined(); // the replacer left them out
    expect(selectHasValidationErrors(deal.getState())).toBe(false);
    actions.writePaths([{ path: firstProduct(deal).pathOf("strike"), value: "1" }]);

    connection.dispatch("JUMP_TO_STATE", connection.sends[validIndex].state);
    const state = deal.getState();
    const product = firstProduct(deal);
    const report = {
      actionsKept: state.actions === actions,
      spotStreamKept: typeof state.spotPriceStream.start,
      strike: (product.data as unknown as { optionsCommon: { strike: string } }).optionsCommon.strike,
      notionalAmount: state.notionalAmount,
      hasValidationErrors: selectHasValidationErrors(state),
      productIssues: Object.fromEntries(Object.entries(issuesOf(product.data)).map(([field, issues]) => [field, issues!.map(({ message }) => message)])),
    };
    console.log("[zustand JUMP]", JSON.stringify(report));
    expect(report.actionsKept).toBe(true);
    expect(report.spotStreamKept).toBe("function");
    expect(report.strike).toBe(""); // the data is back...
    expect(report.notionalAmount).toBeNull(); // ...but NaN came back as null
    expect(report.hasValidationErrors).toBe(true); // valid when recorded, invalid after the jump
    // the actions still work after a jump
    state.actions.writePaths([{ path: product.pathOf("strike"), value: "2" }]);
    expect((firstProduct(deal).data as unknown as { optionsCommon: { strike: string } }).optionsCommon.strike).toBe("2");
  });

  it("history: a nested autocalc set is logged before the write that caused it, with the write's entry showing the later state", async () => {
    const app = await importApp(undefined, { isSpotPriceStreamEnabled: false, isAutocalcEnabled: true });
    const { deal, extension } = app;
    const connection = extension.byName("Deal 1 (Zustand)")!;
    const { actions } = deal.getState();
    actions.addNewGroup("VanillaGroup");
    actions.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(80);
    const before = connection.sends.length;
    actions.writePaths([{ path: firstProduct(deal).pathOf("strike"), value: "1" }]);
    const logged = connection.sends.slice(before).map(({ action, state }) => `${action.type}:${JSON.parse(state).calc.status}`);
    console.log("[zustand devtools order]", JSON.stringify(logged));
    expect(logged).toEqual(["calculate:calculating", "writePaths:calculating"]); // 'outdated' is never shown
    await sleep(60);
  });

  it("a JUMP to a 'calculating' state stays 'Calculating…' for good; a JUMP to an 'outdated' state starts a real calculation", async () => {
    const app = await importApp(undefined, { isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    const { deal, extension, devtoolsStore } = app;
    const connection = extension.byName("Deal 1 (Zustand)")!;
    const { actions } = deal.getState();
    actions.addNewGroup("VanillaGroup");
    // no empty number anywhere (NaN would come back null and invalid): the jumped states stay valid
    actions.writePaths([
      { path: "notionalCcy", value: "USD" },
      { path: "notionalAmount", value: 1000 },
      { path: "expiryDate", value: "2999-01-01" },
    ]);
    await sleep(20);
    actions.calculate();
    await sleep(60);
    actions.writePaths([{ path: firstProduct(deal).pathOf("strike"), value: "1" }]);
    const calculating = connection.sends.findLastIndex(({ action }) => action.type === "calculate");
    const outdated = connection.sends.length - 1;
    expect(JSON.parse(connection.sends[calculating].state).calc.status).toBe("calculating");
    expect(JSON.parse(connection.sends[outdated].state).calc.status).toBe("outdated");
    devtoolsStore.setState({ isAutocalcEnabled: true }); // the user turns autocalc on
    await sleep(60);
    expect(deal.getState().calc.status).toBe("done");

    connection.dispatch("JUMP_TO_STATE", connection.sends[calculating].state);
    await sleep(100);
    const afterCalculatingJump = deal.getState().calc.status;

    const sendsBefore = connection.sends.length;
    connection.dispatch("JUMP_TO_STATE", connection.sends[outdated].state);
    const rightAfterOutdatedJump = deal.getState().calc.status;
    await sleep(60);
    const recordedAfterJump = connection.sends.slice(sendsBefore).map(({ action }) => action.type);
    console.log("[zustand JUMP calc]", JSON.stringify({ afterCalculatingJump, rightAfterOutdatedJump, recordedAfterJump }));
    expect(afterCalculatingJump).toBe("calculating"); // nothing in flight will ever settle it
    expect(rightAfterOutdatedJump).toBe("calculating"); // autocalc ran during time travel (a real request)
    expect(recordedAfterJump).toEqual(["calculated"]); // and its response is appended as new history
  });

  it("persist(devtools(...)): the extension starts from the defaults, not the stored switches; RESET overwrites what is stored", async () => {
    const stored = { "zustand-devtools": JSON.stringify({ state: { isSpotPriceStreamEnabled: false, isAutocalcEnabled: false }, version: 0 }) };
    installFakeApi();
    const extension = installFakeExtension();
    const { data } = installLocalStorage(stored);
    vi.resetModules();
    const { devtoolsStore, multiTabStore } = await import("../../../src-zustand/stores/multiTabStore.ts");
    const connection = extension.byName("Devtools (Zustand)")!;
    const hydrated = devtoolsStore.getState();
    const shownAtInit = JSON.parse(connection.inits[0]);
    // the order's point: an action keeps its name, and is saved at once
    multiTabStore.getState().actions.toggleAutocalcEnabled();
    expect(connection.sends.at(-1)?.action.type).toBe("toggleAutocalcEnabled");
    expect(JSON.parse(data.get("zustand-devtools")!).state.isAutocalcEnabled).toBe(true);
    multiTabStore.getState().actions.toggleAutocalcEnabled();
    connection.dispatch("RESET");
    const afterReset = JSON.parse(data.get("zustand-devtools")!).state;
    console.log("[zustand persist+devtools]", JSON.stringify({ hydrated, shownAtInit, afterReset }));
    expect(hydrated).toEqual({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    expect(shownAtInit).toEqual({ isSpotPriceStreamEnabled: true, isAutocalcEnabled: true }); // not what the store holds
    expect(afterReset).toEqual({ isSpotPriceStreamEnabled: true, isAutocalcEnabled: true }); // RESET persisted the defaults
  });
});

describe("zustand: listeners", () => {
  const createDeal = async (isAutocalcEnabled: boolean) => {
    installFakeApi();
    vi.resetModules();
    const { createStore } = await import("zustand/vanilla");
    const { createDealStore } = await import("../../../src-zustand/stores/dealStore.ts");
    const { createPathDeal } = await import("../../../src-zustand/stores/pathDeal.ts");
    const devtools = createStore(() => ({ isSpotPriceStreamEnabled: false, isAutocalcEnabled }));
    const deal = createDealStore(devtools);
    return { deal, devtools, createPathDeal };
  };

  it("a listener after autocalc is called twice with the newest state (the 2nd time with an older prev); PathDeal still emits once", async () => {
    const { deal, createPathDeal } = await createDeal(true);
    const { actions } = deal.getState();
    actions.addNewGroup("VanillaGroup");
    actions.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(60);
    const seen: string[] = [];
    const stopRaw = deal.subscribe((state, prev) => seen.push(`${prev.calc.status}→${state.calc.status}`));
    const emitted: string[] = [];
    const stopHub = createPathDeal(deal).subscribe((change) => emitted.push(change.kind));
    actions.writePaths([{ path: firstProduct(deal as never).pathOf("strike"), value: "1" }]);
    stopRaw();
    stopHub();
    console.log("[zustand listener order]", JSON.stringify({ seen, emitted }));
    // called twice, both times with the newest state: first for the nested set, then with the older `prev`
    expect(seen).toEqual(["outdated→calculating", "done→calculating"]);
    expect(emitted).toEqual(["products"]);
  });

  it("same-value and no-op writes notify nothing; a superseded response notifies nothing", async () => {
    const { deal } = await createDeal(false);
    const { actions } = deal.getState();
    actions.addNewGroup("VanillaGroup");
    let notified = 0;
    const stop = deal.subscribe(() => notified++);
    const product = firstProduct(deal as never);
    actions.writePaths([{ path: "hedgeType", value: "a" }]); // current
    actions.writePaths([{ path: "hedgeType", value: "zzz" }]); // not offered
    actions.writePaths([{ path: "isInternal", value: true }]); // current
    actions.writePaths([{ path: "notionalAmount", value: NaN }]); // NaN over NaN
    actions.writePaths([{ path: "strike", value: "" }]); // an empty broadcast
    actions.writePaths([{ path: product.pathOf("settlementStyle"), value: "Delivery" }]); // current
    actions.writePaths([{ path: "groups.nope.products.nope.data.x", value: 1 }]);
    expect(notified).toBe(0);
    actions.writePaths([{ path: "notionalCcy", value: "USD" }]);
    expect(notified).toBe(1);
    await sleep(20); // the deal column's options load
    actions.calculate();
    expect(notified).toBe(2);
    actions.writePaths([{ path: product.pathOf("strike"), value: "1" }]); // supersedes it
    expect(notified).toBe(3);
    await sleep(60); // the superseded response arrives
    expect(notified).toBe(3);
    stop();
  });

  it("a deal can't be released: the shared options store keeps its autocalc listener (no dispose)", async () => {
    const { createStore } = await import("zustand/vanilla");
    installFakeApi();
    vi.resetModules();
    const { createDealStore } = await import("../../../src-zustand/stores/dealStore.ts");
    const devtools = createStore(() => ({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false }));
    // built in a sync function, so no async frame keeps the deal alive
    const make = () => {
      const deal = createDealStore(devtools);
      deal.getState().actions.addNewGroup("VanillaGroup");
      return new WeakRef(deal);
    };
    const ref = make();
    const control = new WeakRef({ dropped: true });
    await sleep(20);
    await forceGc();
    expect(control.deref()).toBeUndefined();
    console.log(`[zustand] dropped deal still reachable after GC: ${ref.deref() !== undefined}`);
    expect(ref.deref()).toBeDefined();
  });
});

describe("zustand: the WeakMap validation cache", () => {
  it("validates only data objects it hasn't seen: one per edit, none for a clone (it shares its source's data)", async () => {
    let validated = 0;
    vi.doMock(at("src-shared/validation.ts"), async () => {
      const actual = await vi.importActual<typeof import("@shared/validation.ts")>(at("src-shared/validation.ts"));
      return {
        ...actual,
        productIssues: (...args: Parameters<typeof actual.productIssues>) => {
          validated++;
          return actual.productIssues(...args);
        },
      };
    });
    installFakeApi();
    vi.resetModules();
    const { createStore } = await import("zustand/vanilla");
    const { createDealStore } = await import("../../../src-zustand/stores/dealStore.ts");
    const { selectHasValidationErrors } = await import("../../../src-zustand/stores/validation.ts");
    const deal = createDealStore(createStore(() => ({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: true })));
    const { actions } = deal.getState();
    for (let i = 0; i < 20; i++) actions.addNewGroup("VanillaGroup");
    // valid, so the deal-wide check reads every product (it stops at the first invalid one)
    actions.writePaths([{ path: "notionalCcy", value: "USD" }]);
    selectHasValidationErrors(deal.getState());
    const count = (run: () => void) => {
      validated = 0;
      run();
      selectHasValidationErrors(deal.getState());
      return validated;
    };
    const counts = {
      oneEdit: count(() => actions.writePaths([{ path: firstProduct(deal as never, 3).pathOf("strike"), value: "1" }])),
      clone: count(() => actions.cloneGroup(deal.getState().groupIds[3])),
      remove: count(() => actions.removeGroup(deal.getState().groupIds[0])),
      broadcastTo20: count(() => actions.writePaths([{ path: "expiryCut", value: "NY10" }])),
    };
    console.log("[zustand productIssues calls]", JSON.stringify(counts));
    expect(counts).toEqual({ oneEdit: 1, clone: 0, remove: 0, broadcastTo20: 20 });
  });
});
