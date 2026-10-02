import { fileURLToPath } from "node:url";
import { vi } from "vitest";

/**
 * One adapter per app, mapping a common test API onto each app's own stores,
 * so every scenario runs unchanged against valtio, MobX and Effector. This is
 * the only test code that knows the apps' internals.
 */
export type AppName = "valtio" | "mobx" | "effector";
export const appNames: AppName[] = ["valtio", "mobx", "effector"];

type GroupType = "VanillaGroup" | "Strategy" | "Average";

/** A product, held even after it leaves the deal. */
export type ProductHandle = {
  read(fieldId: string): unknown;
  dataKeys(): string[];
};

export type DealAdapter = {
  addGroup(groupType: GroupType): void;
  cloneGroup(groupIndex: number): void;
  removeGroup(groupIndex: number): void;
  /** Group titles in order (asserting each group's index matches its position). */
  groupTitles(): string[];
  groupProductTitles(groupIndex: number): string[];
  groupCount(): number;
  productCount(): number;
  /** The i-th product of the deal, across groups, in display order. */
  product(i: number): ProductHandle;
  productType(i: number): string;
  productIdsOfGroup(groupIndex: number): string[];
  read(i: number, fieldId: string): unknown;
  /** Commits a product field, as its input would. */
  commit(i: number, fieldId: string, value: unknown): void;
  /** Commits a synced deal field (Notional/Premium Ccy), as its input would. */
  sync(fieldId: string, value: string): void;
  dealValue(fieldId: string): unknown;
  /** Commits a deal broadcast field, as its input would. */
  broadcast(fieldId: string, value: unknown): void;
  issues(i: number, fieldId: string): string[];
  hasValidationErrors(): boolean;
  /** Fixing source options as loaded for a settlement style. */
  optionsFor(settlementStyle: string): { status?: string; values: string[]; labels: string[] };
  dispose(): void;
};

type OptionsView = { status?: string; options?: readonly { value: string; label: string }[] };
const optionsView = (state: OptionsView | undefined) => ({
  status: state?.status,
  values: (state?.options ?? []).map((option) => option.value),
  labels: (state?.options ?? []).map((option) => option.label),
});

const at = (relative: string) => fileURLToPath(new URL(`../../../${relative}`, import.meta.url));
const pathGet = (target: unknown, path: string) =>
  path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], target);

const valtio = async (): Promise<DealAdapter> => {
  // the deal reads the devtools flag from the tab store; give it a plain one
  vi.doMock(at("src-valtio/stores/multiTabStore.ts"), async () => {
    const { proxy } = await import("valtio");
    return { multiTabStore: proxy({ devtools: { isSpotPriceStreamEnabled: false } }) };
  });
  const { createDealStore } = await import("../../../src-valtio/stores/dealStore.ts");
  const { optionsStore } = await import("../../../src-valtio/stores/optionsStore.ts");
  const { definitionOf, productTypeOf } = await import("@shared/products/productRegistry.ts");
  const deal = createDealStore();
  type Data = Parameters<typeof productTypeOf>[0];

  const productPaths = () =>
    deal.groupIds.flatMap((g) => deal.groups[g].productIds.map((p) => `groups.${g}.products.${p}`));
  const dataOf = (productPath: string) => pathGet(deal, `${productPath}.data`) as Data;
  const fieldPath = (productPath: string, fieldId: string) =>
    `${productPath}.data.${(definitionOf(productTypeOf(dataOf(productPath))).fieldPaths as Record<string, string>)[fieldId]}`;
  const handle = (data: Data): ProductHandle => ({
    read: (fieldId) => pathGet(data, (definitionOf(productTypeOf(data)).fieldPaths as Record<string, string>)[fieldId]),
    dataKeys: () => Object.keys(data),
  });
  const commit = (fieldPathFromDeal: string, value: unknown, isBroadcast = false) => {
    // the same rule as the inputs: a broadcast is written then reset; empty is ignored
    if (!isBroadcast) return deal.actions.setValueByPath(fieldPathFromDeal, value);
    if (value === "" || Number.isNaN(value)) return;
    deal.actions.setValueByPath(fieldPathFromDeal, value);
    deal.actions.setValueByPath(fieldPathFromDeal, undefined);
  };

  return {
    addGroup: (type) => deal.actions.addNewGroup(type),
    cloneGroup: (i) => deal.actions.cloneGroup(deal.groupIds[i]),
    removeGroup: (i) => deal.actions.removeGroup(deal.groupIds[i] ?? "unknown"),
    groupTitles: () =>
      deal.groupIds.map((id, i) => {
        if (deal.groups[id].ui.index !== i || deal.groups[id].id !== id) throw new Error("bad group index/id");
        return deal.groups[id].ui.title;
      }),
    groupProductTitles: (i) => {
      const group = deal.groups[deal.groupIds[i]];
      return group.productIds.map((p, index) => {
        if (group.products[p].ui.index !== index) throw new Error("bad product index");
        return group.products[p].ui.title;
      });
    },
    groupCount: () => deal.groupIds.length,
    productCount: () => productPaths().length,
    product: (i) => handle(dataOf(productPaths()[i])),
    productType: (i) => productTypeOf(dataOf(productPaths()[i])),
    productIdsOfGroup: (i) => [...deal.groups[deal.groupIds[i]].productIds],
    read: (i, fieldId) => pathGet(deal, fieldPath(productPaths()[i], fieldId)),
    commit: (i, fieldId, value) => commit(fieldPath(productPaths()[i], fieldId), value),
    sync: (fieldId, value) => commit(fieldId, value),
    dealValue: (fieldId) => pathGet(deal, fieldId),
    broadcast: (fieldId, value) => commit(fieldId, value, true),
    issues: (i, fieldId) =>
      (deal.validationErrors[fieldPath(productPaths()[i], fieldId).replaceAll(".", "_")] ?? []).map((issue) => issue.message),
    hasValidationErrors: () => deal.hasValidationErrors,
    optionsFor: (style) => optionsView(optionsStore.byKey[`fixingSources:${style}`]),
    dispose: () => {},
  };
};

const mobx = async (): Promise<DealAdapter> => {
  const { configure, observable, toJS } = await import("mobx");
  configure({ enforceActions: "always" });
  // any MobX warning (e.g. a write outside an action) fails the test
  vi.spyOn(console, "warn").mockImplementation((...args) => {
    throw new Error(`MobX warning: ${args.join(" ")}`);
  });
  const { createDealStore } = await import("../../../src-mobx/stores/dealStore.ts");
  const { optionsStore } = await import("../../../src-mobx/stores/optionsStore.ts");
  const deal = createDealStore(observable({ isSpotPriceStreamEnabled: false }));
  type Product = (typeof deal.products)[number];
  const handle = (product: Product): ProductHandle => ({
    read: (fieldId) => product.fields[fieldId as keyof Product["fields"]].value,
    dataKeys: () => Object.keys(toJS(product.data)),
  });
  const field = (i: number, fieldId: string) => deal.products[i].fields[fieldId as keyof Product["fields"]];
  const dealField = (fieldId: string) => deal.fields[fieldId as keyof typeof deal.fields]!;

  return {
    addGroup: (type) => deal.addNewGroup(type),
    cloneGroup: (i) => deal.cloneGroup(deal.groupIds[i]),
    removeGroup: (i) => deal.removeGroup(deal.groupIds[i] ?? "unknown"),
    groupTitles: () =>
      deal.groupIds.map((id, i) => {
        if (deal.groups[id].ui.index !== i || deal.groups[id].id !== id) throw new Error("bad group index/id");
        return deal.groups[id].ui.title;
      }),
    groupProductTitles: (i) =>
      deal.groups[deal.groupIds[i]].productList.map((product, index) => {
        if (product.ui.index !== index) throw new Error("bad product index");
        return product.ui.title;
      }),
    groupCount: () => deal.groupIds.length,
    productCount: () => deal.products.length,
    product: (i) => handle(deal.products[i]),
    productType: (i) => deal.products[i].data.productType,
    productIdsOfGroup: (i) => [...deal.groups[deal.groupIds[i]].productIds],
    read: (i, fieldId) => field(i, fieldId).value,
    commit: (i, fieldId, value) => field(i, fieldId).commit(value),
    sync: (fieldId, value) => dealField(fieldId).commit(value),
    dealValue: (fieldId) => dealField(fieldId).value,
    broadcast: (fieldId, value) => dealField(fieldId).commit(value),
    issues: (i, fieldId) => field(i, fieldId).issues.map((issue) => issue.message),
    hasValidationErrors: () => deal.hasValidationErrors,
    optionsFor: (style) => optionsView(optionsStore.byKey[`fixingSources:${style}`]),
    dispose: () => deal.dispose(),
  };
};

const effector = async (): Promise<DealAdapter> => {
  const { createStore } = await import("effector");
  const { createDealStore } = await import("../../../src-effector/stores/dealStore.ts");
  const { readProductField } = await import("../../../src-effector/stores/productStore.ts");
  const { $optionsByKey } = await import("../../../src-effector/stores/optionsStore.ts");
  const deal = createDealStore({ $isSpotPriceStreamEnabled: createStore(false) });
  type Product = Parameters<typeof readProductField>[0];
  type FieldId = Parameters<typeof readProductField>[1];

  const groups = () => deal.$groups.getState();
  const list = () => {
    const { byId, order } = groups();
    const products = deal.$products.getState();
    return order.flatMap((g) => byId[g].productIds.map((p) => products[p]));
  };
  const handle = (product: Product): ProductHandle => ({
    read: (fieldId) => readProductField(product, fieldId as FieldId),
    dataKeys: () => Object.keys(product.data),
  });

  return {
    addGroup: (type) => deal.actions.addGroupAction(type),
    cloneGroup: (i) => deal.actions.cloneGroupAction(groups().order[i]),
    removeGroup: (i) => deal.actions.removeGroupAction(groups().order[i] ?? "unknown"),
    groupTitles: () =>
      groups().order.map((id, i) => {
        const group = groups().byId[id];
        if (group.ui.index !== i || group.id !== id) throw new Error("bad group index/id");
        return group.ui.title;
      }),
    groupProductTitles: (i) => {
      const products = deal.$products.getState();
      return groups().byId[groups().order[i]].productIds.map((p, index) => {
        if (products[p].ui.index !== index) throw new Error("bad product index");
        return products[p].ui.title;
      });
    },
    groupCount: () => groups().order.length,
    productCount: () => list().length,
    product: (i) => handle(list()[i]),
    productType: (i) => list()[i].data.productType,
    productIdsOfGroup: (i) => [...groups().byId[groups().order[i]].productIds],
    read: (i, fieldId) => readProductField(list()[i], fieldId as FieldId),
    commit: (i, fieldId, value) =>
      deal.actions.commitProductFieldAction({ productId: list()[i].id, fieldId: fieldId as FieldId, value }),
    sync: (fieldId, value) =>
      deal.actions.commitSyncedFieldAction({ fieldId: fieldId as "notionalCcy" | "premiumCcy", value }),
    dealValue: (fieldId) => (deal.$dealFields.getState() as Record<string, unknown>)[fieldId],
    broadcast: (fieldId, value) =>
      deal.actions.broadcastFieldAction({ fieldId: fieldId as never, value }),
    issues: (i, fieldId) =>
      ((deal.$validation.getState()[list()[i].id] as Record<string, { message: string }[]> | undefined)?.[fieldId] ?? []).map(
        (issue) => issue.message,
      ),
    hasValidationErrors: () => deal.$hasValidationErrors.getState(),
    optionsFor: (style) => optionsView($optionsByKey.getState()[`fixingSources:${style}`]),
    dispose: () => deal.dispose(),
  };
};

/** A fresh deal, with fresh modules (no state shared between tests). */
export const createAdapter = async (app: AppName): Promise<DealAdapter> => {
  vi.resetModules();
  return { valtio, mobx, effector }[app]();
};
