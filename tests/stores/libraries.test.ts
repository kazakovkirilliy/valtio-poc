import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { productPath } from "@shared/paths.ts";
import { definitionOf, productTypeOf } from "@shared/products/productRegistry.ts";
import { installFakeApi } from "./support/fakeApi.ts";

// guarantees that are specific to how each library updates

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A product field's dot path. */
const fieldPath = (groupId: string, product: { id: string; data: { productType: string } }, fieldId: string) =>
  productPath(groupId, product.id, (definitionOf(productTypeOf(product.data)).fieldPaths as Record<string, string>)[fieldId]);

describe("mobx", () => {
  beforeEach(() => {
    installFakeApi();
    vi.resetModules();
  });

  it("re-runs a reaction only for the field it reads", async () => {
    const { autorun, configure, observable } = await import("mobx");
    configure({ enforceActions: "always" });
    const { createDealStore } = await import("../../src-mobx/stores/dealStore.ts");
    const deal = createDealStore(observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false }));
    deal.addNewGroup("Strategy");
    deal.addNewGroup("Average");
    const [strategyId, averageId] = deal.groupIds;
    const [watched, sibling, other] = deal.products;
    const write = (groupId: string, product: typeof watched, fieldId: string, value: unknown) =>
      deal.writePaths([{ path: fieldPath(groupId, product, fieldId), value }]);
    let runs = 0;
    const stop = autorun(() => {
      void watched.fields.strike.value;
      void watched.fields.strike.issues;
      runs++;
    });
    write(strategyId, sibling, "strike", "5");
    write(averageId, other, "ccyPair", "GBPUSD");
    expect(runs).toBe(1); // unrelated edits
    write(strategyId, watched, "strike", "7");
    expect(runs).toBe(2); // its own edit, once
    write(strategyId, watched, "deliveryDate", "2999-03-02");
    const before = runs;
    const rule = autorun(() => void watched.fields.deliveryDate.issues);
    write(strategyId, watched, "expiryDate", "2999-03-05"); // the rule's dependency
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
    const deal = createDealStore({ $isSpotPriceStreamEnabled: createStore(false), $isAutocalcEnabled: createStore(false) });
    deal.actions.addGroupAction("Strategy");
    deal.actions.addGroupAction("Average");
    const [strategyId] = deal.$groups.getState().order;
    const productIds = Object.keys(deal.$products.getState());
    const edited = deal.$products.getState()[productIds[0]];
    const write = () => deal.actions.writePathsAction([{ path: fieldPath(strategyId, edited, "expiryCut"), value: "TK15" }]);

    const products = deal.$products.getState();
    const validation = deal.$validation.getState();
    write();
    for (const id of productIds.slice(1)) {
      expect(deal.$products.getState()[id]).toBe(products[id]);
      expect(deal.$validation.getState()[id]).toBe(validation[id]); // not re-validated
    }
    expect(deal.$products.getState()[edited.id]).not.toBe(products[edited.id]);

    const unchanged = deal.$products.getState();
    write();
    expect(deal.$products.getState()).toBe(unchanged); // same value: no update at all
    deal.dispose();
  });

  it("exposes only its requests as actions", async () => {
    const { createStore } = await import("effector");
    const { createDealStore } = await import("../../src-effector/stores/dealStore.ts");
    const deal = createDealStore({ $isSpotPriceStreamEnabled: createStore(false), $isAutocalcEnabled: createStore(false) });
    expect(Object.keys(deal.actions).sort()).toEqual([
      "addGroupAction", "calculateAction", "cloneGroupAction", "removeGroupAction", "writePathsAction",
    ]);
    deal.dispose();
  });
});

describe("effector-nested", () => {
  beforeEach(() => {
    installFakeApi();
    vi.resetModules();
  });

  const createDeal = async () => {
    const { createStore } = await import("effector");
    const { createDealStore } = await import("../../src-effector-nested/stores/dealStore.ts");
    return createDealStore({ $isSpotPriceStreamEnabled: createStore(false), $isAutocalcEnabled: createStore(false) });
  };

  it("copies only the path to an edited product", async () => {
    const deal = await createDeal();
    deal.actions.addGroupAction("Strategy");
    deal.actions.addGroupAction("Average");
    const groups = deal.$groups.getState();
    const [strategyId, averageId] = Object.keys(groups);
    const [edited, sibling] = Object.keys(groups[strategyId].products);
    const averageProductId = Object.keys(groups[averageId].products)[0];
    const validation = deal.$validation.getState();
    const write = () =>
      deal.actions.writePathsAction([
        { path: fieldPath(strategyId, groups[strategyId].products[edited], "expiryCut"), value: "TK15" },
      ]);

    write();
    const next = deal.$groups.getState();
    expect(next[strategyId]).not.toBe(groups[strategyId]); // the path to the product is copied …
    expect(next[strategyId].products[edited]).not.toBe(groups[strategyId].products[edited]);
    expect(next[strategyId].ui).toBe(groups[strategyId].ui); // … nothing else
    expect(next[strategyId].products[sibling]).toBe(groups[strategyId].products[sibling]);
    expect(next[averageId]).toBe(groups[averageId]);
    expect(Object.keys(next)).toEqual([strategyId, averageId]); // order kept
    expect(deal.$validation.getState()[sibling]).toBe(validation[sibling]); // not re-validated
    expect(deal.$validation.getState()[averageProductId]).toBe(validation[averageProductId]);

    write();
    expect(deal.$groups.getState()).toBe(next); // same value: no update at all
    deal.dispose();
  });

  it("inserts a clone right after its source, in key order", async () => {
    const deal = await createDeal();
    deal.actions.addGroupAction("VanillaGroup");
    deal.actions.addGroupAction("Average");
    const [first, last] = Object.keys(deal.$groups.getState());
    deal.actions.cloneGroupAction(first);
    const ids = Object.keys(deal.$groups.getState());
    expect(ids).toHaveLength(3);
    expect([ids[0], ids[2]]).toEqual([first, last]);
    expect(Object.values(deal.$groups.getState()).map((group) => group.ui.title)).toEqual([
      "Vanilla Group #1", "Vanilla Group #2", "Average #3",
    ]);
    deal.dispose();
  });
});

describe("effector-model", () => {
  beforeEach(() => {
    installFakeApi();
    vi.resetModules();
  });

  const createDeal = async () => {
    const { createStore } = await import("effector");
    const { createDealStore } = await import("../../src-effector-model/stores/dealStore.ts");
    return createDealStore({ $isSpotPriceStreamEnabled: createStore(false), $isAutocalcEnabled: createStore(false) });
  };

  it("a write reaches only its own product's stores", async () => {
    const deal = await createDeal();
    deal.actions.addGroupAction("Strategy");
    deal.actions.addGroupAction("Average");
    const groups = deal.$groups.getState();
    const [strategy, average] = groups;
    const [edited, sibling] = strategy.products;
    const write = () => deal.actions.writePathsAction([{ path: fieldPath(strategy.id, edited as never, "expiryCut"), value: "TK15" }]);

    write();
    const [nextStrategy, nextAverage] = deal.$groups.getState();
    expect(nextStrategy.products[0]).not.toBe(edited); // the edited product's item …
    expect(nextStrategy.products[1]).toBe(sibling); // … nothing else
    expect(nextStrategy.products[1].issues).toBe(sibling.issues); // not re-validated
    expect(nextStrategy.ui).toBe(strategy.ui);
    expect(nextAverage).toBe(average);

    const unchanged = deal.$groups.getState();
    write();
    expect(deal.$groups.getState()).toBe(unchanged); // same value: no update at all
    deal.dispose();
  });

  it("inserts a clone right after its source", async () => {
    const deal = await createDeal();
    deal.actions.addGroupAction("VanillaGroup");
    deal.actions.addGroupAction("Average");
    const [first, last] = deal.$order.getState();
    deal.actions.cloneGroupAction(first);
    const ids = deal.$order.getState();
    expect(ids).toHaveLength(3);
    expect([ids[0], ids[2]]).toEqual([first, last]);
    expect(deal.$groups.getState().map((group) => group.ui.title)).toEqual([
      "Vanilla Group #1", "Vanilla Group #2", "Average #3",
    ]);
    deal.dispose();
  });
});
