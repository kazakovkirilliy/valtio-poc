import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeApi } from "./support/fakeApi.ts";

// guarantees that are specific to how each library updates

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mobx", () => {
  beforeEach(() => {
    installFakeApi();
    vi.resetModules();
  });

  it("re-runs a reaction only for the field it reads", async () => {
    const { autorun, configure, observable } = await import("mobx");
    configure({ enforceActions: "always" });
    const { createDealStore } = await import("../../src-mobx/stores/dealStore.ts");
    const deal = createDealStore(observable({ isSpotPriceStreamEnabled: false }));
    deal.addNewGroup("Strategy");
    deal.addNewGroup("Average");
    const [watched, sibling, other] = deal.products;
    let runs = 0;
    const stop = autorun(() => {
      void watched.fields.strike.value;
      void watched.fields.strike.issues;
      runs++;
    });
    sibling.fields.strike.commit("5");
    other.fields.ccyPair.commit("GBPUSD");
    expect(runs).toBe(1); // unrelated edits
    watched.fields.strike.commit("7");
    expect(runs).toBe(2); // its own edit, once
    watched.fields.deliveryDate.commit("2999-03-02");
    const before = runs;
    const rule = autorun(() => void watched.fields.deliveryDate.issues);
    watched.fields.expiryDate.commit("2999-03-05"); // the rule's dependency
    expect(watched.fields.deliveryDate.issues).toHaveLength(1);
    rule();
    stop();
    expect(runs).toBe(before);
    deal.dispose();
  });
});

describe("effector", () => {
  beforeEach(() => {
    installFakeApi();
    vi.resetModules();
  });

  it("keeps untouched products, and their validation, as the same objects", async () => {
    const { createStore } = await import("effector");
    const { createDealStore } = await import("../../src-effector/stores/dealStore.ts");
    const deal = createDealStore({ $isSpotPriceStreamEnabled: createStore(false) });
    deal.actions.addGroupAction("Strategy");
    deal.actions.addGroupAction("Average");
    const productIds = Object.keys(deal.$products.getState());
    const edited = productIds[0];

    const products = deal.$products.getState();
    const validation = deal.$validation.getState();
    deal.actions.commitProductFieldAction({ productId: edited, fieldId: "expiryCut", value: "TK15" });
    for (const id of productIds.slice(1)) {
      expect(deal.$products.getState()[id]).toBe(products[id]);
      expect(deal.$validation.getState()[id]).toBe(validation[id]); // not re-validated
    }
    expect(deal.$products.getState()[edited]).not.toBe(products[edited]);

    const unchanged = deal.$products.getState();
    deal.actions.commitProductFieldAction({ productId: edited, fieldId: "expiryCut", value: "TK15" });
    expect(deal.$products.getState()).toBe(unchanged); // same value: no update at all
    deal.dispose();
  });

  it("exposes only its requests as actions", async () => {
    const { createStore } = await import("effector");
    const { createDealStore } = await import("../../src-effector/stores/dealStore.ts");
    const deal = createDealStore({ $isSpotPriceStreamEnabled: createStore(false) });
    expect(Object.keys(deal.actions).sort()).toEqual([
      "addGroupAction", "broadcastFieldAction", "cloneGroupAction",
      "commitProductFieldAction", "commitSyncedFieldAction", "removeGroupAction",
    ]);
    deal.dispose();
  });
});
