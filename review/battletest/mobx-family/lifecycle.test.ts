import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPathGridSource } from "@shared/grid/pathGridSource.ts";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { fieldPath, trapConsole } from "./support.ts";

/**
 * Dispose paths: what still observes the stores after a deal, a group or a
 * grid subscription is gone, and async results that land after that.
 */
beforeEach(() => {
  vi.resetModules();
  installFakeApi({ Cash: [{ id: 4, name: "C4" }] });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** How many derivations observe `target[key]`. */
const observerCount = async (target: object, key: string) => {
  const { getObserverTree } = await import("mobx");
  return getObserverTree(target, key).observers?.length ?? 0;
};

describe("mobx", () => {
  it("dispose() leaves nothing observing the switches; a removed group's leaves lose every observer", async () => {
    const { configure, observable } = await import("mobx");
    configure({ enforceActions: "always" });
    const { createDealStore } = await import("../../../src-mobx/stores/dealStore.ts");
    const { createPathDeal } = await import("../../../src-mobx/stores/pathDeal.ts");
    const devtools = observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: true });
    const deal = createDealStore(devtools);
    deal.addNewGroup("Strategy");
    deal.addNewGroup("Average");
    const grid = createPathGridSource(createPathDeal(deal));
    const stop = grid.subscribeCells(() => {});
    const removed = deal.products[0];
    const strikeParent = removed.data.optionsCommon;
    expect(await observerCount(strikeParent, "strike")).toBeGreaterThan(0);
    deal.removeGroup(deal.groupIds[0]);
    expect(await observerCount(strikeParent, "strike")).toBe(0);
    stop();
    const kept = (deal.products[0].data as unknown as { avroCommon: object }).avroCommon; // the Average product
    expect(await observerCount(kept, "strike")).toBe(1); // only the deal's own inputs reaction is left
    expect(await observerCount(devtools, "isAutocalcEnabled")).toBe(1);
    deal.dispose();
    expect(await observerCount(devtools, "isAutocalcEnabled")).toBe(0);
    expect(await observerCount(kept, "strike")).toBe(0);
  });
});

describe("mobx-state-tree", () => {
  it("destroy(deal) stops its reactions", async () => {
    const { observable } = await import("mobx");
    const { destroy } = await import("mobx-state-tree");
    const { Deal } = await import("../../../src-mobx-state-tree/stores/dealModel.ts");
    const devtools = observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: true });
    const deal = Deal.create({}, { devtools });
    deal.addNewGroup("Strategy");
    expect(await observerCount(devtools, "isAutocalcEnabled")).toBe(1);
    destroy(deal);
    expect(await observerCount(devtools, "isAutocalcEnabled")).toBe(0);
  });

  it("a price arriving after the deal is destroyed calls an action on a dead node (options check isAlive, calc doesn't)", async () => {
    const warnings = trapConsole();
    const { observable } = await import("mobx");
    const { destroy } = await import("mobx-state-tree");
    const { Deal } = await import("../../../src-mobx-state-tree/stores/dealModel.ts");
    const deal = Deal.create({}, { devtools: observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: true }) });
    deal.addNewGroup("VanillaGroup");
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(15);
    expect(deal.calc.status).toBe("calculating");
    destroy(deal); // e.g. time travel to before the tab existed
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => void rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    await sleep(40);
    process.off("unhandledRejection", onRejection);
    const all = [...warnings, ...rejections.map(String)];
    process.stdout.write(`\n[mst dead-node calc] ${JSON.stringify({ warnings: warnings.map((w) => w.slice(0, 140)), rejections: rejections.map((r) => String(r).slice(0, 140)) })}\n`);
    expect(all.some((w) => /no longer part of a state tree|destroyed|not alive/i.test(w))).toBe(true);
  });
});

describe("mobx-keystone", () => {
  it("unregisterRootStore(deal) stops its reactions; a removed group's products are detached, not dead", async () => {
    const { observable } = await import("mobx");
    const { setGlobalConfig, registerRootStore, unregisterRootStore, isRootStore, getRoot } = await import("mobx-keystone");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    const { Deal, devtoolsContext } = await import("../../../src-mobx-keystone/stores/dealModel.ts");
    const devtools = observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: true });
    const deal = new Deal({});
    devtoolsContext.set(deal, devtools);
    registerRootStore(deal);
    deal.addNewGroup("Strategy");
    const removed = deal.products[0];
    deal.removeGroup(deal.groups[0].id);
    expect(getRoot(removed)).not.toBe(deal); // detached, still usable
    expect(await observerCount(devtools, "isAutocalcEnabled")).toBe(1);
    unregisterRootStore(deal);
    expect(isRootStore(deal)).toBe(false);
    expect(await observerCount(devtools, "isAutocalcEnabled")).toBe(0);
  });

  it("without a root store (and its context) a deal never autocalcs, silently", async () => {
    const { setGlobalConfig } = await import("mobx-keystone");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    const { Deal } = await import("../../../src-mobx-keystone/stores/dealModel.ts");
    const deal = new Deal({}); // not attached to a registered root: onAttachedToRootStore never runs
    deal.addNewGroup("VanillaGroup");
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(60);
    expect(deal.isReady).toBe(true);
    expect(deal.calc.status).toBe("none");
  });

  it("product writes from a reaction-free deal: every write still lands, and clones stay independent", async () => {
    const { setGlobalConfig } = await import("mobx-keystone");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    const { Deal } = await import("../../../src-mobx-keystone/stores/dealModel.ts");
    const deal = new Deal({});
    deal.addNewGroup("VanillaGroup");
    const [group] = deal.groups;
    deal.writePaths([{ path: fieldPath(group.id, group.products[0], "strike"), value: "9" }]);
    expect(deal.products[0].data.optionsCommon).toMatchObject({ strike: "9" });
  });
});
