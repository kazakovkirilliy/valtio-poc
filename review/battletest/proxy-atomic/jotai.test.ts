import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Atom } from "jotai/vanilla";
import { productPath } from "@shared/paths.ts";
import { definitionOf, productTypeOf } from "@shared/products/productRegistry.ts";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { at, forceGc, installFakeExtension, installLocalStorage } from "./support.ts";

/** The default store outlives `vi.resetModules()` (jotai is external): undo the devtools patch after each test. */
let restoreSet: (() => void) | undefined;
beforeEach(async () => {
  const { getDefaultStore } = await import("jotai/vanilla");
  const store = getDefaultStore();
  const original = store.set;
  restoreSet = () => {
    store.set = original;
  };
});
afterEach(() => {
  restoreSet?.();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock(at("src-shared/validation.ts"));
});

const internals = async () => {
  const { getDefaultStore } = await import("jotai/vanilla");
  const { INTERNAL_getBuildingBlocksRev4, INTERNAL_KEY_mountedMap } = await import("jotai/vanilla/internals");
  const store = getDefaultStore();
  const mountedMap = INTERNAL_getBuildingBlocksRev4(store)[INTERNAL_KEY_mountedMap] as WeakMap<Atom<unknown>, unknown>;
  return { store, isMounted: (atom: Atom<unknown>) => mountedMap.has(atom) };
};

const createDeal = async (isAutocalcEnabled = false) => {
  installFakeApi();
  vi.resetModules();
  const { atom } = await import("jotai/vanilla");
  const { createDealStore } = await import("../../../src-jotai/stores/dealStore.ts");
  const { createPathDeal } = await import("../../../src-jotai/stores/pathDeal.ts");
  const { optionsStore } = await import("../../../src-jotai/stores/optionsStore.ts");
  const devtoolsAtom = atom({ isSpotPriceStreamEnabled: false, isAutocalcEnabled });
  const deal = createDealStore(devtoolsAtom);
  return { deal, devtoolsAtom, createPathDeal, optionsStore };
};

describe("jotai: the default store", () => {
  it("is one store for every test file run: vi.resetModules() doesn't recreate it", async () => {
    vi.resetModules();
    const first = (await import("jotai/vanilla")).getDefaultStore();
    vi.resetModules();
    const second = (await import("jotai/vanilla")).getDefaultStore();
    expect(second).toBe(first);
    expect((globalThis as { __JOTAI_DEFAULT_STORE__?: unknown }).__JOTAI_DEFAULT_STORE__).toBe(first);
  });

  it("a deal that isn't disposed stays mounted in it after its modules are gone", async () => {
    const { isMounted } = await internals();
    const { deal } = await createDeal();
    vi.resetModules(); // the next test's modules
    expect(isMounted(deal.isReadyAtom)).toBe(true); // still subscribed: autocalc's store.sub
    deal.dispose();
    expect(isMounted(deal.isReadyAtom)).toBe(false);
  });
});

describe("jotai: atoms in atoms", () => {
  it("a removed group's atoms are unmounted and garbage-collected; dispose unmounts the deal and frees it", async () => {
    const { isMounted, store } = await internals();
    const { deal, createPathDeal, optionsStore } = await createDeal(true);
    const stopGrid = createPathDeal(deal).subscribe(() => {});
    deal.actions.addNewGroup("Strategy");
    deal.actions.addNewGroup("VanillaGroup");
    await sleep(20);
    // in a sync function, so no async frame keeps the removed group's atoms alive
    const removeFirstGroup = () => {
      const removedId = store.get(deal.groupIdsAtom)[0];
      const removed = store.get(deal.groupsAtom)[removedId];
      const atoms = [removed.uiAtom, ...removed.productIds.flatMap((id) => [removed.products[id].dataAtom, removed.products[id].issuesAtom])];
      const mountedBefore = atoms.map(isMounted);
      deal.actions.removeGroup(removedId);
      return { mountedBefore, mountedAfter: atoms.map(isMounted), refs: atoms.map((atom) => new WeakRef(atom)) };
    };
    const { mountedBefore, mountedAfter, refs } = removeFirstGroup();
    // ui: no subscriber reads it; the 2nd product's issues: the deal-wide check stops at the 1st invalid product
    expect(mountedBefore).toEqual([false, true, true, true, false]);
    expect(mountedAfter).toEqual([false, false, false, false, false]);
    const control = new WeakRef({ dropped: true });
    await forceGc();
    expect(control.deref()).toBeUndefined();
    const collected = refs.filter((ref) => ref.deref() === undefined).length;
    console.log(`[jotai] removed group's atoms collected: ${collected}/${refs.length}`);
    expect(collected).toBe(refs.length);

    // dispose: the deal's own atoms unmount, and the deal can be collected
    stopGrid();
    deal.dispose();
    expect([deal.isReadyAtom, deal.hasValidationErrorsAtom, deal.calcAtom, optionsStore.pendingAtom].map(isMounted)).toEqual([false, false, false, false]);
  });

  it("a disposed deal is collectable (contrast: valtio and zustand deals aren't)", async () => {
    const { deal: first } = await createDeal(true); // loads the modules
    first.dispose();
    const { createDealStore } = await import("../../../src-jotai/stores/dealStore.ts");
    const { atom } = await import("jotai/vanilla");
    // built in a sync function, so no async frame keeps the deal alive
    const make = () => {
      const deal = createDealStore(atom({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: true }));
      deal.actions.addNewGroup("VanillaGroup");
      return { ref: new WeakRef(deal), dispose: () => deal.dispose() };
    };
    let made: ReturnType<typeof make> | undefined = make();
    const ref = made.ref;
    await sleep(30); // its option loads settle
    made.dispose();
    made = undefined;
    const control = new WeakRef({ dropped: true });
    await sleep(30);
    await forceGc();
    expect(control.deref()).toBeUndefined();
    console.log(`[jotai] disposed deal still reachable after GC: ${ref.deref() !== undefined}`);
    expect(ref.deref()).toBeUndefined();
  });
});

describe("jotai: validation and notification scope", () => {
  it("re-validates a clone (new issues atom) where zustand's WeakMap doesn't; readiness notifies only on flips", async () => {
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
    const { store } = await internals();
    const { deal } = await createDeal(false);
    for (let i = 0; i < 20; i++) deal.actions.addNewGroup("VanillaGroup");
    deal.actions.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(20);
    let readyNotified = 0;
    const stop = store.sub(deal.isReadyAtom, () => readyNotified++);
    const pathOf = (groupIndex: number, fieldId: string) => {
      const group = store.get(deal.groupsAtom)[store.get(deal.groupIdsAtom)[groupIndex]];
      const productId = group.productIds[0];
      const data = store.get(group.products[productId].dataAtom);
      return productPath(group.id, productId, (definitionOf(productTypeOf(data)).fieldPaths as Record<string, string>)[fieldId]);
    };
    const count = (run: () => void) => {
      validated = 0;
      run();
      store.get(deal.isReadyAtom);
      return validated;
    };
    const counts = {
      oneEdit: count(() => deal.actions.writePaths([{ path: pathOf(3, "strike"), value: "1" }])),
      clone: count(() => deal.actions.cloneGroup(store.get(deal.groupIdsAtom)[3])),
      remove: count(() => deal.actions.removeGroup(store.get(deal.groupIdsAtom)[0])),
      broadcastTo20: count(() => deal.actions.writePaths([{ path: "expiryCut", value: "NY10" }])),
    };
    for (let i = 0; i < 10; i++) deal.actions.writePaths([{ path: pathOf(5, "strike"), value: String(i) }]);
    const readyAfterValidEdits = readyNotified;
    deal.actions.writePaths([{ path: pathOf(5, "strike"), value: "1234" }]);
    deal.actions.writePaths([{ path: pathOf(6, "strike"), value: "1234" }]); // still not ready: no flip
    stop();
    deal.dispose();
    console.log("[jotai productIssues calls]", JSON.stringify(counts), `isReadyAtom notified ${readyAfterValidEdits}x for 10 valid edits, ${readyNotified}x in all`);
    expect(counts).toEqual({ oneEdit: 1, clone: 1, remove: 0, broadcastTo20: 20 });
    expect(readyAfterValidEdits).toBe(0);
    expect(readyNotified).toBe(1);
  });
});

describe("jotai: atomWithStorage without subscribe", () => {
  it("never listens to other tabs, writes at once, and reads the stored value before anything mounts", async () => {
    const addEventListener = vi.fn();
    class FakeStorage {}
    vi.stubGlobal("window", { addEventListener, removeEventListener: vi.fn(), Storage: FakeStorage, location: { search: "" } });
    const { data, storage } = installLocalStorage();
    Object.setPrototypeOf(storage, FakeStorage.prototype); // jotai only follows a real `Storage`
    vi.resetModules();
    const { getDefaultStore } = await import("jotai/vanilla");
    const { atomWithStorage, createJSONStorage } = await import("jotai/vanilla/utils");
    const store = getDefaultStore();
    const { multiTabStore } = await import("../../../src-jotai/stores/multiTabStore.ts");
    const stop = store.sub(multiTabStore.devtoolsAtom, () => {}); // mounted, as a component would
    multiTabStore.actions.toggleAutocalcEnabled();
    const writtenAtOnce = data.get("jotai-devtools");
    stop();
    // control: the same atom with jotai's default JSON storage does follow other tabs
    const control = atomWithStorage("control", 1, createJSONStorage<number>());
    const stopControl = store.sub(control, () => {});
    stopControl();
    const storageListeners = addEventListener.mock.calls.filter(([type]) => type === "storage").length;

    vi.resetModules();
    const reloaded = await import("../../../src-jotai/stores/multiTabStore.ts");
    const reloadedValue = store.get(reloaded.multiTabStore.devtoolsAtom);
    console.log("[jotai atomWithStorage]", JSON.stringify({ writtenAtOnce, storageListeners, reloadedValue }));
    expect(JSON.parse(writtenAtOnce!)).toEqual({ isSpotPriceStreamEnabled: true, isAutocalcEnabled: false });
    expect(storageListeners).toBe(1); // the control's only
    expect(reloadedValue).toEqual({ isSpotPriceStreamEnabled: true, isAutocalcEnabled: false });
  });
});

describe("jotai: devtools.ts (store.set wrapped for the Redux DevTools extension)", () => {
  it("reports each outermost labelled action; async continuations and unlabelled top-level sets are reported differently or not at all", async () => {
    installFakeApi();
    const extension = installFakeExtension();
    installLocalStorage();
    vi.resetModules();
    const { getDefaultStore } = await import("jotai/vanilla");
    const store = getDefaultStore();
    await import("../../../src-jotai/devtools.ts");
    const { multiTabStore } = await import("../../../src-jotai/stores/multiTabStore.ts");
    const connection = extension.byName("Deal editor (Jotai)")!;
    const reported = () => connection.sends.map(({ action, state }) => {
      const parsed = JSON.parse(state);
      const deal = Object.values(parsed.deals)[0] as { calc: { status: string } } | undefined;
      return `${action.type}${deal ? ` [calc ${deal.calc.status}, pending ${parsed.options.pending}]` : ""}`;
    });

    // an unlabelled atom set at the top level (what a `useSetAtom(primitiveAtom)` does)
    store.set(multiTabStore.devtoolsAtom, { isSpotPriceStreamEnabled: false, isAutocalcEnabled: true });
    const afterUnlabelled = connection.sends.length;

    multiTabStore.actions.addNewDeal();
    const deal = Object.values(store.get(multiTabStore.dealsAtom))[0];
    deal.actions.addNewGroup("VanillaGroup");
    deal.actions.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(80); // options arrive, autocalc starts, the price arrives
    const log = reported();
    deal.dispose();
    console.log("[jotai devtools log]", JSON.stringify(log, null, 1));
    expect(afterUnlabelled).toBe(0); // not reported at all: no label, and inside a store.set
    expect(log.slice(0, 3).map((entry) => entry.split(" ")[0])).toEqual(["addNewDeal", "addNewGroup", "writePaths"]);
    expect(log.some((entry) => entry.startsWith("(outside an action)"))).toBe(true);
  });
});
