import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getValueByPath } from "@shared/lib/path.ts";
import { productPath } from "@shared/paths.ts";
import { definitionOf, productTypeOf, readField } from "@shared/products/productRegistry.ts";
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

describe("mobx-state-tree", () => {
  beforeEach(() => {
    installFakeApi();
    vi.resetModules();
  });

  it("a write replaces only its own product's data, and only when a value changes", async () => {
    const { observable } = await import("mobx");
    const { destroy } = await import("mobx-state-tree");
    const { Deal } = await import("../../src-mobx-state-tree/stores/dealModel.ts");
    const deal = Deal.create({}, { devtools: observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false }) });
    deal.addNewGroup("Strategy");
    deal.addNewGroup("Average");
    const [strategy, average] = deal.groups;
    const [edited, sibling] = strategy.products;
    const before = { edited: edited.data, sibling: sibling.data, average: average.products[0].data };
    const write = () => deal.writePaths([{ path: fieldPath(strategy.id, edited, "expiryCut"), value: "TK15" }]);

    write();
    expect(edited.data).not.toBe(before.edited);
    expect(getValueByPath(edited.data, "optionsCommon")).not.toBe(getValueByPath(before.edited, "optionsCommon")); // the path to the field is copied …
    expect(edited.data.cashSettlement).toBe(before.edited.cashSettlement); // … nothing else
    expect(sibling.data).toBe(before.sibling);
    expect(average.products[0].data).toBe(before.average);

    const written = edited.data;
    write();
    expect(edited.data).toBe(written); // same value: nothing replaced
    destroy(deal);
  });
});

describe("mobx-keystone", () => {
  beforeEach(() => {
    installFakeApi();
    vi.resetModules();
  });

  it("a clone gets new ids and its own copy of the data", async () => {
    const { setGlobalConfig } = await import("mobx-keystone");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    const { Deal } = await import("../../src-mobx-keystone/stores/dealModel.ts");
    const deal = new Deal({});
    deal.addNewGroup("VanillaGroup");
    deal.addNewGroup("Average");
    deal.cloneGroup(deal.groups[0].id);
    const [source, copy] = deal.groups;
    expect(deal.groups.map((group) => group.title)).toEqual(["Vanilla Group #1", "Vanilla Group #2", "Average #3"]);
    expect(copy.id).not.toBe(source.id);
    expect(copy.products[0].id).not.toBe(source.products[0].id);

    deal.writePaths([{ path: fieldPath(copy.id, copy.products[0], "expiryCut"), value: "TK15" }]);
    expect(readField(copy.products[0].data, "expiryCut")).toBe("TK15");
    expect(readField(source.products[0].data, "expiryCut")).toBe("");

    deal.removeGroup(source.id);
    expect(deal.groups.map((group) => group.title)).toEqual(["Vanilla Group #1", "Average #2"]); // renumbered
  });
});

describe("legend-state", () => {
  beforeEach(() => {
    installFakeApi();
    vi.resetModules();
  });

  it("a write sets only its own leaf, and only when its value changes", async () => {
    const { observable } = await import("@legendapp/state");
    const { createDealStore } = await import("../../src-legend-state/stores/dealStore.ts");
    const deal = createDealStore(observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false }));
    deal.addNewGroup("Strategy");
    deal.addNewGroup("Average");
    const { groupIds, groups } = deal.deal$.peek();
    const strategy = groups[groupIds[0]];
    const edited = strategy.products[strategy.productIds[0]];
    const changed: string[] = [];
    const stop = deal.deal$.groups.onChange(({ changes }) => changed.push(...changes.map(({ path }) => path.join("."))));
    const path = fieldPath(strategy.id, edited, "expiryCut");

    deal.writePaths([{ path, value: "TK15" }]);
    expect(changed).toEqual([path.slice("groups.".length)]); // one leaf: no sibling, no other group
    expect(readField(edited.data, "expiryCut")).toBe("TK15"); // the plain data, written in place

    deal.writePaths([{ path, value: "TK15" }]);
    expect(changed).toHaveLength(1); // same value: nothing set
    stop();
    deal.dispose();
  });
});

describe("redux", () => {
  beforeEach(() => {
    installFakeApi();
    vi.resetModules();
  });

  it("a write copies only the path to its product, and only when a value changes", async () => {
    const { createApp } = await import("../../src-redux/stores/store.ts");
    const { addDeal, addGroup, cloneGroup, writePaths } = await import("../../src-redux/stores/thunks.ts");
    const { store, dispose } = createApp({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    const dealId = store.dispatch(addDeal());
    store.dispatch(addGroup(dealId, "Strategy"));
    store.dispatch(addGroup(dealId, "Average"));
    const before = store.getState().deals[dealId];
    const [strategy, average] = before.groupIds.map((id) => before.groups[id]);
    const [edited, sibling] = strategy.productIds.map((id) => strategy.products[id]);
    const write = () =>
      store.dispatch(writePaths(dealId, [{ path: fieldPath(strategy.id, edited, "expiryCut"), value: "TK15" }]));

    write();
    const after = store.getState().deals[dealId];
    expect(after.groups[strategy.id].products[edited.id].data).not.toBe(edited.data);
    expect(after.groups[strategy.id].products[edited.id].data.cashSettlement).toBe(edited.data.cashSettlement); // shared
    expect(after.groups[strategy.id].products[sibling.id]).toBe(sibling);
    expect(after.groups[average.id]).toBe(average);
    expect(after.dealFields).toBe(before.dealFields);

    const { deals } = store.getState();
    write();
    expect(store.getState().deals).toBe(deals); // same value: the same state

    store.dispatch(cloneGroup(dealId, average.id)); // immutable: the clone shares its source's data
    const cloned = store.getState().deals[dealId];
    const copy = cloned.groups[cloned.groupIds[2]];
    expect(copy.id).not.toBe(average.id);
    expect(copy.products[copy.productIds[0]].data).toBe(average.products[average.productIds[0]].data);
    dispose();
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
