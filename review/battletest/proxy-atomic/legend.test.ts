import { afterEach, describe, expect, it, vi } from "vitest";
import { productPath } from "@shared/paths.ts";
import { definitionOf, productTypeOf } from "@shared/products/productRegistry.ts";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { forceGc, installFakeExtension, installLocalStorage } from "./support.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const createDeal = async () => {
  installFakeApi();
  vi.resetModules();
  const legend = await import("@legendapp/state");
  const { createDealStore } = await import("../../../src-legend-state/stores/dealStore.ts");
  const { createPathDeal } = await import("../../../src-legend-state/stores/pathDeal.ts");
  const devtools$ = legend.observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
  const deal = createDealStore(devtools$);
  return { legend, deal, devtools$, createPathDeal };
};

type LegendDeal = Awaited<ReturnType<typeof createDeal>>["deal"];
type LegendNode = { listeners?: Set<unknown>; listenersImmediate?: Set<unknown>; children?: Map<string, unknown> };
type LegendModule = Awaited<ReturnType<typeof createDeal>>["legend"];
/** Legend-State's node behind an observable (exported at runtime, not typed). */
const nodeOf = (legend: LegendModule, observable: unknown) =>
  (legend as unknown as { getNode: (observable: unknown) => LegendNode }).getNode(observable);
/** A vanilla product's strike observable. */
const strike$ = (deal: LegendDeal, groupId: string, productId: string) =>
  (deal.deal$.groups[groupId].products[productId].data as unknown as { optionsCommon: { strike: unknown } }).optionsCommon.strike;

const pathOf = (deal: LegendDeal, groupIndex: number, fieldId: string) => {
  const { groupIds, groups } = deal.deal$.peek();
  const group = groups[groupIds[groupIndex]];
  const productId = group.productIds[0];
  const data = group.products[productId].data;
  return productPath(group.id, productId, (definitionOf(productTypeOf(data)).fieldPaths as Record<string, string>)[fieldId]);
};

describe("legend-state: removed groups", () => {
  it("a removed product's nodes stay in the tree with their validation computeds listening (never disposed)", async () => {
    const { legend, deal } = await createDeal();
    deal.addNewGroup("VanillaGroup");
    deal.addNewGroup("VanillaGroup");
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]); // valid: every product's computeds are read
    deal.hasValidationErrors$.get();
    const groupsNode = nodeOf(legend, deal.deal$.groups);
    const { groupIds, groups } = deal.deal$.peek();
    const removedId = groupIds[0];
    const productId = groups[removedId].productIds[0];
    const strikeNodeBefore = nodeOf(legend, strike$(deal, removedId, productId));
    const listenersBefore = (strikeNodeBefore.listeners?.size ?? 0) + (strikeNodeBefore.listenersImmediate?.size ?? 0);
    deal.removeGroup(removedId);
    const strikeNodeAfter = nodeOf(legend, strike$(deal, removedId, productId));
    const listenersAfter = (strikeNodeAfter.listeners?.size ?? 0) + (strikeNodeAfter.listenersImmediate?.size ?? 0);

    // add and remove 200 more groups: the groups node keeps a child per removed id
    for (let i = 0; i < 200; i++) {
      deal.addNewGroup("VanillaGroup");
      const ids = deal.deal$.groupIds.peek();
      deal.removeGroup(ids[ids.length - 1]);
    }
    deal.hasValidationErrors$.get();
    const report = {
      sameNodeAfterRemoval: strikeNodeAfter === strikeNodeBefore,
      listenersBefore,
      listenersAfter,
      groupsInState: Object.keys(deal.deal$.groups.peek()).length,
      groupNodesKept: groupsNode.children?.size,
    };
    console.log("[legend removed groups]", JSON.stringify(report));
    expect(report.sameNodeAfterRemoval).toBe(true);
    expect(report.listenersAfter).toBeGreaterThan(0); // the removed product's computeds still listen
    expect(report.groupsInState).toBe(1);
    expect(report.groupNodesKept).toBeGreaterThanOrEqual(200);
    deal.dispose();
  });

  it("…and the removed product's leaf node and its remaining computed listener survive GC (held by the tree)", async () => {
    const { legend, deal } = await createDeal();
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    // in a sync function, so nothing but the library holds what it creates
    const make = () => {
      deal.addNewGroup("VanillaGroup");
      const ids = deal.deal$.groupIds.peek();
      const id = ids[ids.length - 1];
      deal.hasValidationErrors$.get(); // observed, as the header and autocalc observe it
      const productId = deal.deal$.groups[id].productIds.peek()[0];
      const leaf$ = strike$(deal, id, productId);
      deal.removeGroup(id);
      const node = nodeOf(legend, leaf$);
      const listeners = [...(node.listeners ?? []), ...(node.listenersImmediate ?? [])];
      return { node: new WeakRef(node), listeners: listeners.map((listener) => new WeakRef(listener as object)) };
    };
    const refs = make();
    const control = new WeakRef({ dropped: true });
    await forceGc();
    expect(control.deref()).toBeUndefined();
    const report = { nodeAlive: refs.node.deref() !== undefined, listenersAlive: refs.listeners.filter((ref) => ref.deref()).length };
    console.log("[legend] after GC, a removed product's leaf node and listeners:", JSON.stringify(report));
    expect(report).toEqual({ nodeAlive: true, listenersAlive: 1 });
    deal.dispose();
  });
});

describe("legend-state: computeds during a batch", () => {
  it("a listener of the batch reads a stale hasValidationErrors$ (why autocalc defers with queueMicrotask)", async () => {
    const { deal } = await createDeal();
    deal.addNewGroup("VanillaGroup");
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(20);
    expect(deal.hasValidationErrors$.get()).toBe(false);
    expect(deal.isReady$.get()).toBe(true);
    const seenInListener: boolean[] = [];
    const stop = deal.deal$.groups.onChange(() => seenInListener.push(deal.isReady$.get()));
    deal.writePaths([{ path: pathOf(deal, 0, "strike"), value: "1234" }]); // invalid
    stop();
    const afterBatch = deal.isReady$.get();
    console.log("[legend stale computed]", JSON.stringify({ isReadyInListener: seenInListener, isReadyAfterBatch: afterBatch }));
    expect(afterBatch).toBe(false);
    expect(seenInListener).toEqual([true]); // stale while the batch notifies
    deal.dispose();
  });
});

describe("legend-state: in-place writes", () => {
  it("PathDeal hands out the live objects: data read before an edit changes under the reader", async () => {
    const { deal, createPathDeal } = await createDeal();
    deal.addNewGroup("VanillaGroup");
    const pathDeal = createPathDeal(deal);
    const [group] = pathDeal.getGroups();
    const before = pathDeal.getProduct(group.productIds[0])!.data as { optionsCommon: { strike: string } };
    deal.writePaths([{ path: pathOf(deal, 0, "strike"), value: "5" }]);
    const after = pathDeal.getProduct(group.productIds[0])!.data;
    expect(after).toBe(before); // same object...
    expect(before.optionsCommon.strike).toBe("5"); // ...changed in place
    deal.dispose();
  });
});

describe("legend-state: syncObservable + ObservablePersistLocalStorage", () => {
  it("saves the switches a tick after a change (not synchronously) and restores them on reload", async () => {
    const { data } = installLocalStorage();
    vi.resetModules();
    const { devtools$ } = await import("../../../src-legend-state/stores/multiTabStore.ts");
    devtools$.isAutocalcEnabled.set(false);
    const savedAtOnce = Object.fromEntries(data);
    await sleep(0);
    const savedAfterTick = Object.fromEntries(data);
    vi.resetModules();
    const reloaded = await import("../../../src-legend-state/stores/multiTabStore.ts");
    const restored = reloaded.devtools$.peek();
    console.log("[legend persist]", JSON.stringify({ savedAtOnce, savedAfterTick, restored }));
    expect(restored).toEqual({ isSpotPriceStreamEnabled: true, isAutocalcEnabled: false });
  });
});

describe("legend-state: devtools.ts", () => {
  it("reports each batch with the whole app's state; one keystroke is two reports (the edit, then 'price outdated')", async () => {
    installFakeApi();
    const extension = installFakeExtension();
    installLocalStorage();
    vi.resetModules();
    const { devtools$, multiTab$, addNewDeal, dealStores } = await import("../../../src-legend-state/stores/multiTabStore.ts");
    await import("../../../src-legend-state/devtools.ts");
    devtools$.assign({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    const connection = extension.byName("Deal editor (Legend-State)")!;
    addNewDeal();
    const deal = dealStores.get(multiTab$.activeDealId.peek())!;
    deal.addNewGroup("VanillaGroup");
    await sleep(20);
    const before = connection.sends.length;
    deal.writePaths([{ path: pathOf(deal as never, 0, "strike"), value: "1" }]);
    const sent = connection.sends.slice(before).map(({ action }) => action.type.replace(/[0-9a-f-]{36}/g, "<id>"));
    console.log("[legend devtools] one keystroke:", JSON.stringify(sent));
    expect(sent.length).toBe(2);
    for (const stream of dealStores.values()) stream.dispose();
  });
});
