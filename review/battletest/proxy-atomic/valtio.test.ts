import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { at, forceGc, installFakeExtension, installLocalStorage } from "./support.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock(at("src-valtio/stores/multiTabStore.ts"));
});

/** The deal on its own, the way the store tests build it: a plain devtools proxy instead of the tab store. */
const createDeal = async () => {
  vi.resetModules();
  vi.doMock(at("src-valtio/stores/multiTabStore.ts"), async () => {
    const { proxy } = await import("valtio");
    return { multiTabStore: proxy({ devtools: { isSpotPriceStreamEnabled: false, isAutocalcEnabled: false } }) };
  });
  const { createDealStore } = await import("../../../src-valtio/stores/dealStore.ts");
  const { multiTabStore } = await import("../../../src-valtio/stores/multiTabStore.ts");
  return { createDealStore, multiTabStore };
};

const strikePath = (deal: { groupIds: string[]; groups: Record<string, { productIds: string[] }> }, groupIndex = 0) => {
  const groupId = deal.groupIds[groupIndex];
  return `groups.${groupId}.products.${deal.groups[groupId].productIds[0]}.data.optionsCommon.strike`;
};

describe("valtio: Redux DevTools (valtio/utils `devtools` on multiTabStore)", () => {
  it("sends every deal on every change, and a JUMP replaces the live stores (actions included) with JSON", async () => {
    installFakeApi();
    const extension = installFakeExtension();
    installLocalStorage();
    vi.resetModules();
    const { multiTabStore, devtoolsStore } = await import("../../../src-valtio/stores/multiTabStore.ts");
    devtoolsStore.isSpotPriceStreamEnabled = false;
    devtoolsStore.isAutocalcEnabled = false;
    const connection = extension.byName("multiTab")!;
    expect(connection).toBeDefined();

    const sizeOfOneEdit = async () => {
      const deal = multiTabStore.deals[multiTabStore.activeDealId];
      if (!deal.groupIds.length) deal.actions.addNewGroup("VanillaGroup");
      await sleep(20);
      const before = connection.sends.length;
      deal.actions.writePaths([{ path: strikePath(deal), value: String(before % 10) }]);
      await sleep(5);
      const sent = connection.sends.slice(before);
      return { sends: sent.length, bytes: sent.reduce((sum, { state }) => sum + state.length, 0) };
    };
    multiTabStore.actions.addNewDeal();
    const oneDeal = await sizeOfOneEdit();
    for (let i = 0; i < 4; i++) {
      multiTabStore.actions.addNewDeal();
      await sizeOfOneEdit();
    }
    const fiveDeals = await sizeOfOneEdit();
    console.log(`[valtio devtools] one keystroke: ${JSON.stringify(oneDeal)} with 1 deal, ${JSON.stringify(fiveDeals)} with 5 deals`);
    expect(fiveDeals.bytes).toBeGreaterThan(oneDeal.bytes * 4); // the whole tree, every deal, per keystroke

    // time travel: jump back to the state right after the first deal was added
    const liveActions = multiTabStore.actions;
    connection.dispatch("JUMP_TO_STATE", connection.sends[0].state);
    await sleep(5);
    const firstDeal = Object.values(multiTabStore.deals)[0] as unknown as Record<string, unknown>;
    const report = {
      tabActions: typeof multiTabStore.actions.addNewDeal,
      sameActionsObject: multiTabStore.actions === liveActions,
      devtoolsStillThePersistedProxy: multiTabStore.devtools === devtoolsStore,
      dealActions: typeof (firstDeal.actions as Record<string, unknown>).writePaths,
      dealSpotStreamStart: typeof (firstDeal.spotPriceStream as Record<string, unknown>).start,
    };
    console.log("[valtio devtools] after JUMP_TO_STATE:", JSON.stringify(report));
    // JSON has no functions: every action is gone, and the switches are detached from the persisted proxy
    expect(report).toEqual({
      tabActions: "undefined",
      sameActionsObject: false,
      devtoolsStillThePersistedProxy: false,
      dealActions: "undefined",
      dealSpotStreamStart: "undefined",
    });
    expect(() => multiTabStore.actions.addNewDeal()).toThrow(TypeError);
  });
});

describe("valtio: valtio-auto-persist", () => {
  it("saves the switches 100 ms after a change, under a key hashed from their shape", async () => {
    const { data } = installLocalStorage();
    vi.stubGlobal("window", { location: { search: "" } });
    vi.stubGlobal("Element", class {});
    vi.resetModules();
    const { multiTabStore, devtoolsStore } = await import("../../../src-valtio/stores/multiTabStore.ts");
    expect({ ...devtoolsStore }).toEqual({ isSpotPriceStreamEnabled: true, isAutocalcEnabled: true }); // the `??=` fill
    devtoolsStore.isSpotPriceStreamEnabled = false;
    multiTabStore.actions.toggleAutocalcEnabled();
    await sleep(50);
    const afterFiftyMs = Object.fromEntries(data);
    await sleep(100);
    const afterOneFiftyMs = Object.fromEntries(data);
    console.log("[valtio-auto-persist] storage 50 ms after a toggle:", JSON.stringify(afterFiftyMs), "after 150 ms:", JSON.stringify(afterOneFiftyMs));
    expect(afterFiftyMs).toEqual({}); // a reload in this window loses the toggle
    const [key] = Object.keys(afterOneFiftyMs);
    expect(key).not.toMatch(/devtools/i); // not a name: a hash of the state's shape
    expect(JSON.parse(afterOneFiftyMs[key])).toEqual({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });

    vi.resetModules();
    const reloaded = await import("../../../src-valtio/stores/multiTabStore.ts");
    expect({ ...reloaded.devtoolsStore }).toEqual({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
  });
});

describe("valtio: subscriptions", () => {
  it("a removed group's validation subscriptions are dropped (writes into its detached data change nothing)", async () => {
    installFakeApi();
    const { createDealStore } = await createDeal();
    const deal = createDealStore();
    deal.actions.addNewGroup("VanillaGroup");
    deal.actions.addNewGroup("Strategy");
    const removedId = deal.groupIds[0];
    const detached = deal.groups[removedId].products[deal.groups[removedId].productIds[0]].data as { optionsCommon: { strike: string } };
    deal.actions.removeGroup(removedId);
    const keys = Object.keys(deal.validationErrors);
    const calc = deal.calc;
    detached.optionsCommon.strike = "TOOLONG";
    await sleep(5);
    expect(Object.keys(deal.validationErrors)).toEqual(keys);
    expect(keys.some((key) => key.includes(removedId))).toBe(false);
    expect(deal.calc).toBe(calc);
  });

  it("each leaf of a batch notifies the deal's sync subscriptions on its own: a 3-cell paste outdates the price 3 times", async () => {
    installFakeApi();
    const { createDealStore } = await createDeal();
    const deal = createDealStore();
    deal.actions.addNewGroup("VanillaGroup");
    const path = strikePath(deal);
    const before = deal.calc.requestId;
    deal.actions.writePaths([
      { path, value: "1" },
      { path: path.replace("optionsCommon.strike", "optionsCommon.callPut"), value: "Call" },
      { path: path.replace("optionsCommon.strike", "optionsCommon.base.expiryCut"), value: "TK" },
    ]);
    console.log(`[valtio] calc.requestId moved by ${deal.calc.requestId - before} for one 3-cell paste`);
    expect(deal.calc.requestId - before).toBe(3);
  });

  it("useProxyKeys(multiTabStore.deals) is a deep subscription: notified by every keystroke in every deal", async () => {
    installFakeApi();
    installLocalStorage();
    vi.stubGlobal("window", { location: { search: "" } });
    vi.stubGlobal("Element", class {});
    vi.resetModules();
    const { subscribe } = await import("valtio");
    const { multiTabStore, devtoolsStore } = await import("../../../src-valtio/stores/multiTabStore.ts");
    devtoolsStore.isSpotPriceStreamEnabled = false;
    devtoolsStore.isAutocalcEnabled = false;
    multiTabStore.actions.addNewDeal();
    const deal = multiTabStore.deals[multiTabStore.activeDealId];
    deal.actions.addNewGroup("VanillaGroup");
    await sleep(20);
    let notified = 0;
    const stop = subscribe(multiTabStore.deals, () => notified++);
    for (let i = 0; i < 10; i++) {
      deal.actions.writePaths([{ path: strikePath(deal), value: String(i) }]);
      await sleep(0);
    }
    stop();
    console.log(`[valtio] subscribe(multiTabStore.deals) ran ${notified} times for 10 keystrokes (keys unchanged: no re-render)`);
    expect(notified).toBe(10);
  });

  it("DealHeader's useSnapshot(validationErrors) changes on any field's issues, even when readiness doesn't flip", async () => {
    installFakeApi();
    const { createDealStore } = await createDeal();
    const { snapshot } = await import("valtio");
    const deal = createDealStore();
    deal.actions.addNewGroup("VanillaGroup");
    const path = strikePath(deal);
    const snapshots = [snapshot(deal.validationErrors)];
    const readiness = [deal.hasValidationErrors];
    for (const value of ["1234", "12345", "x", "callPut:Nope"]) {
      const [field, written] = value.includes(":") ? value.split(":") : ["strike", value];
      deal.actions.writePaths([{ path: path.replace("strike", field), value: written }]);
      snapshots.push(snapshot(deal.validationErrors));
      readiness.push(deal.hasValidationErrors);
    }
    const changes = snapshots.slice(1).filter((snap, i) => snap !== snapshots[i]).length;
    console.log(`[valtio] validationErrors snapshot changed ${changes}/4 times; hasValidationErrors: ${JSON.stringify(readiness)}`);
    expect(readiness.every(Boolean)).toBe(true); // the deal is invalid throughout (notionalCcy default)
    expect(changes).toBeGreaterThanOrEqual(3); // ...yet the header's snapshot changes, so it re-renders
  });

  it("a deal can't be released: global stores keep its subscriptions and effects (no dispose)", async () => {
    installFakeApi();
    const { createDealStore } = await createDeal();
    // built in a sync function, so no async frame keeps the deal alive
    const make = () => {
      const deal = createDealStore();
      deal.actions.addNewGroup("VanillaGroup");
      return new WeakRef(deal);
    };
    const ref = make();
    const control = new WeakRef({ dropped: true }); // proves the GC ran
    await sleep(20);
    await forceGc();
    console.log(`[valtio] dropped deal still reachable after GC: ${ref.deref() !== undefined}`);
    expect(control.deref()).toBeUndefined();
    expect(ref.deref()).toBeDefined();
  });
});
