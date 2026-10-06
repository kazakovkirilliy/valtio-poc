import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { it, vi } from "vitest";
import type { DealChange, PathDeal } from "@shared/pathDeal.ts";
import type { ProductFieldId } from "@shared/fields.ts";
import type { PathWrite } from "@shared/paths.ts";
import { productPath } from "@shared/paths.ts";
import { type ProductData, definitionOf, productTypeOf, readField } from "@shared/products/productRegistry.ts";
import { type AppName, appNames as adapterAppNames } from "../../../stores/support/adapters.ts";

export type { AppName };
/** Every app, in the adapters' order (a plain re-export of an import comes out undefined in this transform). */
export const appNames: readonly AppName[] = [...adapterAppNames];

/**
 * Cross-app battletest harness (scratch, untracked). Every app is built the
 * way `tests/stores/support/adapters.ts` builds it, but several deals can
 * share one set of modules (one "page"), the fixing-sources API and the
 * pricing request are under the test's control, and a recorder checks the
 * `PathDeal.subscribe` contract against before/after snapshots.
 */

const at = (relative: string) => fileURLToPath(new URL(`../../../../${relative}`, import.meta.url));

/** STRICT=1 runs known failures as plain tests, to see their real assertion output. */
const strict = process.env.STRICT === "1";

/** `it`, or `it.fails` for the apps a finding names (a regression marker that turns red once fixed). */
export const itFor = (app: AppName, failing: readonly AppName[]) => (failing.includes(app) && !strict ? it.fails : it);

/** Writes observations to `tests/battletest/cross-app/results/<name>.json` (for the report). */
export const saveResults = (name: string, data: unknown) => {
  const dir = fileURLToPath(new URL("../results/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}${name}.json`, JSON.stringify(data, (_key, value) => (Number.isNaN(value) ? "NaN" : value), 1));
};

// ---------------------------------------------------------------- timing

/** Lets every queued microtask and a zero timeout run (valtio and legend notify a tick later). */
export const flush = async (rounds = 3) => {
  for (let i = 0; i < rounds; i++) {
    for (let j = 0; j < 20; j++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

// ---------------------------------------------------------------- fixing-sources API under control

type Listed = { id: number; name: string };

export type PendingFetch = {
  style: string;
  /** Answers with `list`, or the API's current list for the style. */
  respond(list?: Listed[]): void;
  /** Answers HTTP 500. */
  fail(): void;
};

export type ControlledApi = {
  lists: Record<string, Listed[]>;
  /** The settlementStyle of every request, in order. */
  requests: string[];
  /** Requests not answered yet, oldest first (manual mode). */
  pending: PendingFetch[];
  /** "auto": every request is answered a microtask later with the current list. */
  mode: "manual" | "auto";
  /** Answers every pending request (oldest first) with the current lists. */
  respondAll(): void;
};

export const installControlledApi = (lists: Record<string, Listed[]> = {}, mode: "manual" | "auto" = "manual") => {
  const api: ControlledApi = {
    lists,
    requests: [],
    pending: [],
    mode,
    respondAll() {
      while (api.pending.length) api.pending.shift()!.respond();
    },
  };
  vi.stubGlobal("fetch", (input: string | URL) => {
    const url = new URL(String(input));
    const style = url.searchParams.get("settlementStyle") ?? "";
    api.requests.push(style);
    return new Promise<Response>((resolve) => {
      let done = false;
      const entry: PendingFetch = {
        style,
        respond: (list) => {
          if (done) return;
          done = true;
          api.pending = api.pending.filter((other) => other !== entry);
          resolve(Response.json((list ?? api.lists[style] ?? []).map((option) => ({ ...option, email: "dropped" }))));
        },
        fail: () => {
          if (done) return;
          done = true;
          api.pending = api.pending.filter((other) => other !== entry);
          resolve(new Response("{}", { status: 500 }));
        },
      };
      if (api.mode === "auto") queueMicrotask(() => entry.respond());
      else api.pending.push(entry);
    });
  });
  return api;
};

// ---------------------------------------------------------------- pricing request under control

export type PendingCalc = {
  /** Its position among every request made. */
  index: number;
  /** The price the real request would answer, from the products it was given. */
  price: number;
  productCount: number;
  resolve(price?: number): void;
  reject(): void;
  settled: boolean;
};

export type CalcControl = {
  calls: PendingCalc[];
  pending(): PendingCalc[];
  mode: "manual" | "auto";
  resolveAll(): void;
};

const priceOf = (products: readonly ProductData[]) =>
  Math.round(products.reduce((sum, data) => sum + 1 + (Number(readField(data, "notionalAmount")) || 0) / 1000, 0) * 100) / 100;

export const calcControl: CalcControl = {
  calls: [],
  pending: () => calcControl.calls.filter((call) => !call.settled),
  mode: "manual",
  resolveAll() {
    for (const call of calcControl.pending()) call.resolve();
  },
};

/** Replaces `src-shared/api/calculate.ts` for the apps imported after it (call before `launch`). */
export const mockCalculate = (mode: "manual" | "auto" = "manual") => {
  calcControl.calls = [];
  calcControl.mode = mode;
  vi.doMock(at("src-shared/api/calculate.ts"), () => ({
    calculatePrice: (products: readonly ProductData[]) =>
      new Promise<number>((resolve, reject) => {
        const call: PendingCalc = {
          index: calcControl.calls.length,
          price: priceOf(products),
          productCount: products.length,
          settled: false,
          resolve: (price) => {
            if (call.settled) return;
            call.settled = true;
            resolve(price ?? call.price);
          },
          reject: () => {
            if (call.settled) return;
            call.settled = true;
            reject(new Error("pricing failed"));
          },
        };
        calcControl.calls.push(call);
        if (calcControl.mode === "auto") queueMicrotask(() => call.resolve());
      }),
  }));
};

// ---------------------------------------------------------------- the apps, several deals per page

export type DealHandle = {
  deal: PathDeal;
  calc(): { status: string; price: number | null };
  calculate(): void;
  hasValidationErrors(): boolean;
  dispose(): void;
  /** The app's own store, for leak checks. */
  raw: unknown;
};

export type Page = {
  app: AppName;
  deals: DealHandle[];
  /** The app-wide autocalc switch: every deal of the page reads it. */
  setAutocalc(enabled: boolean): void;
  /** The page's shared options store, as the deals read it. */
  options(): Record<string, { status: string; options: readonly { value: string }[] }>;
};

const launchers: Record<AppName, (count: number) => Promise<Page>> = {
  valtio: async (count) => {
    vi.doMock(at("src-valtio/stores/multiTabStore.ts"), async () => {
      const { proxy } = await import("valtio");
      return { multiTabStore: proxy({ devtools: { isSpotPriceStreamEnabled: false, isAutocalcEnabled: false } }) };
    });
    const { createDealStore } = await import("../../../../src-valtio/stores/dealStore.ts");
    const { createPathDeal } = await import("../../../../src-valtio/stores/pathDeal.ts");
    const { multiTabStore } = await import("../../../../src-valtio/stores/multiTabStore.ts");
    const deals = Array.from({ length: count }, () => {
      const deal = createDealStore();
      return {
        deal: createPathDeal(deal),
        calc: () => ({ status: deal.calc.status, price: deal.calc.price }),
        calculate: () => deal.actions.calculate(),
        hasValidationErrors: () => deal.hasValidationErrors,
        dispose: () => {},
        raw: deal,
      };
    });
    return {
      app: "valtio",
      deals,
      setAutocalc: (enabled) => (multiTabStore.devtools.isAutocalcEnabled = enabled),
      options: () => deals[0].deal.getOptions() as never,
    };
  },
  mobx: async (count) => {
    const { configure, observable, runInAction } = await import("mobx");
    configure({ enforceActions: "always" });
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      throw new Error(`MobX warning: ${args.join(" ")}`);
    });
    const { createDealStore } = await import("../../../../src-mobx/stores/dealStore.ts");
    const { createPathDeal } = await import("../../../../src-mobx/stores/pathDeal.ts");
    const devtools = observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    const deals = Array.from({ length: count }, () => {
      const deal = createDealStore(devtools);
      return {
        deal: createPathDeal(deal),
        calc: () => ({ status: deal.calc.status, price: deal.calc.price }),
        calculate: () => deal.calculate(),
        hasValidationErrors: () => deal.hasValidationErrors,
        dispose: () => deal.dispose(),
        raw: deal,
      };
    });
    return {
      app: "mobx",
      deals,
      setAutocalc: (enabled) => runInAction(() => (devtools.isAutocalcEnabled = enabled)),
      options: () => deals[0].deal.getOptions() as never,
    };
  },
  "mobx-state-tree": async (count) => {
    const { observable, runInAction } = await import("mobx");
    const { destroy } = await import("mobx-state-tree");
    const { Deal } = await import("../../../../src-mobx-state-tree/stores/dealModel.ts");
    const { createPathDeal } = await import("../../../../src-mobx-state-tree/stores/pathDeal.ts");
    const devtools = observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    const deals = Array.from({ length: count }, () => {
      const deal = Deal.create({}, { devtools });
      return {
        deal: createPathDeal(deal),
        calc: () => ({ status: deal.calc.status, price: deal.calc.price }),
        calculate: () => deal.calculate(),
        hasValidationErrors: () => deal.hasValidationErrors,
        dispose: () => destroy(deal),
        raw: deal,
      };
    });
    return {
      app: "mobx-state-tree",
      deals,
      setAutocalc: (enabled) => runInAction(() => (devtools.isAutocalcEnabled = enabled)),
      options: () => deals[0].deal.getOptions() as never,
    };
  },
  "mobx-keystone": async (count) => {
    const { observable, runInAction } = await import("mobx");
    const { registerRootStore, setGlobalConfig, unregisterRootStore } = await import("mobx-keystone");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    const { Deal, devtoolsContext } = await import("../../../../src-mobx-keystone/stores/dealModel.ts");
    const { createPathDeal } = await import("../../../../src-mobx-keystone/stores/pathDeal.ts");
    const devtools = observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    const deals = Array.from({ length: count }, () => {
      const deal = new Deal({});
      devtoolsContext.set(deal, devtools);
      registerRootStore(deal);
      return {
        deal: createPathDeal(deal),
        calc: () => ({ status: deal.calc.status, price: deal.calc.price }),
        calculate: () => deal.calculate(),
        hasValidationErrors: () => deal.hasValidationErrors,
        dispose: () => unregisterRootStore(deal),
        raw: deal,
      };
    });
    return {
      app: "mobx-keystone",
      deals,
      setAutocalc: (enabled) => runInAction(() => (devtools.isAutocalcEnabled = enabled)),
      options: () => deals[0].deal.getOptions() as never,
    };
  },
  "legend-state": async (count) => {
    const { observable } = await import("@legendapp/state");
    const { createDealStore } = await import("../../../../src-legend-state/stores/dealStore.ts");
    const { createPathDeal } = await import("../../../../src-legend-state/stores/pathDeal.ts");
    const devtools$ = observable({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    const deals = Array.from({ length: count }, () => {
      const deal = createDealStore(devtools$);
      return {
        deal: createPathDeal(deal),
        calc: () => ({ status: deal.deal$.calc.status.peek(), price: deal.deal$.calc.price.peek() }),
        calculate: () => deal.calculate(),
        hasValidationErrors: () => deal.hasValidationErrors$.get(),
        dispose: () => deal.dispose(),
        raw: deal,
      };
    });
    return {
      app: "legend-state",
      deals,
      setAutocalc: (enabled) => devtools$.isAutocalcEnabled.set(enabled),
      options: () => deals[0].deal.getOptions() as never,
    };
  },
  redux: async (count) => {
    const { createApp } = await import("../../../../src-redux/stores/store.ts");
    const { addDeal, calculate } = await import("../../../../src-redux/stores/thunks.ts");
    const { autocalcToggled } = await import("../../../../src-redux/stores/devtoolsSlice.ts");
    const { selectHasValidationErrors } = await import("../../../../src-redux/stores/selectors.ts");
    const { createPathDeal } = await import("../../../../src-redux/stores/pathDeal.ts");
    // one store for the page: every tab's deal lives in it
    const { store, dispose } = createApp({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    const deals = Array.from({ length: count }, () => {
      const dealId = store.dispatch(addDeal());
      return {
        deal: createPathDeal(store, dealId),
        calc: () => {
          const { status, price } = store.getState().deals[dealId].calc;
          return { status, price };
        },
        calculate: () => store.dispatch(calculate(dealId)),
        hasValidationErrors: () => selectHasValidationErrors(store.getState(), dealId),
        dispose,
        raw: { store, dealId },
      };
    });
    return {
      app: "redux",
      deals,
      setAutocalc: (enabled) => {
        if (store.getState().devtools.isAutocalcEnabled !== enabled) store.dispatch(autocalcToggled());
      },
      options: () => deals[0].deal.getOptions() as never,
    };
  },
  zustand: async (count) => {
    const { createStore } = await import("zustand/vanilla");
    const { createDealStore } = await import("../../../../src-zustand/stores/dealStore.ts");
    const { createPathDeal } = await import("../../../../src-zustand/stores/pathDeal.ts");
    const { selectHasValidationErrors } = await import("../../../../src-zustand/stores/validation.ts");
    const devtools = createStore(() => ({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false }));
    const deals = Array.from({ length: count }, () => {
      const deal = createDealStore(devtools);
      return {
        deal: createPathDeal(deal),
        calc: () => {
          const { status, price } = deal.getState().calc;
          return { status, price };
        },
        calculate: () => deal.getState().actions.calculate(),
        hasValidationErrors: () => selectHasValidationErrors(deal.getState()),
        dispose: () => {},
        raw: deal,
      };
    });
    return {
      app: "zustand",
      deals,
      setAutocalc: (enabled) => devtools.setState({ isAutocalcEnabled: enabled }),
      options: () => deals[0].deal.getOptions() as never,
    };
  },
  jotai: async (count) => {
    const { atom, getDefaultStore } = await import("jotai/vanilla");
    const { createDealStore } = await import("../../../../src-jotai/stores/dealStore.ts");
    const { createPathDeal } = await import("../../../../src-jotai/stores/pathDeal.ts");
    const store = getDefaultStore();
    const devtoolsAtom = atom({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    const deals = Array.from({ length: count }, () => {
      const deal = createDealStore(devtoolsAtom);
      return {
        deal: createPathDeal(deal),
        calc: () => {
          const { status, price } = store.get(deal.calcAtom);
          return { status, price };
        },
        calculate: () => deal.actions.calculate(),
        hasValidationErrors: () => store.get(deal.hasValidationErrorsAtom),
        dispose: () => deal.dispose(),
        raw: deal,
      };
    });
    return {
      app: "jotai",
      deals,
      setAutocalc: (enabled) => store.set(devtoolsAtom, (devtools) => ({ ...devtools, isAutocalcEnabled: enabled })),
      options: () => deals[0].deal.getOptions() as never,
    };
  },
  "effector-nested": async (count) => {
    const { createEvent, createStore } = await import("effector");
    const { createDealStore } = await import("../../../../src-effector-nested/stores/dealStore.ts");
    const { createPathDeal } = await import("../../../../src-effector-nested/stores/pathDeal.ts");
    const setAutocalc = createEvent<boolean>();
    const $isAutocalcEnabled = createStore(false).on(setAutocalc, (_, enabled) => enabled);
    const $isSpotPriceStreamEnabled = createStore(false);
    const deals = Array.from({ length: count }, () => {
      const deal = createDealStore({ $isSpotPriceStreamEnabled, $isAutocalcEnabled });
      return {
        deal: createPathDeal(deal),
        calc: () => ({ status: deal.$calc.getState().status, price: deal.$calc.getState().price }),
        calculate: () => deal.actions.calculateAction(),
        hasValidationErrors: () => deal.$hasValidationErrors.getState(),
        dispose: () => deal.dispose(),
        raw: deal,
      };
    });
    return { app: "effector-nested", deals, setAutocalc, options: () => deals[0].deal.getOptions() as never };
  },
  "effector-model": async (count) => {
    const { createEvent, createStore } = await import("effector");
    const { createDealStore } = await import("../../../../src-effector-model/stores/dealStore.ts");
    const { createPathDeal } = await import("../../../../src-effector-model/stores/pathDeal.ts");
    const setAutocalc = createEvent<boolean>();
    const $isAutocalcEnabled = createStore(false).on(setAutocalc, (_, enabled) => enabled);
    const $isSpotPriceStreamEnabled = createStore(false);
    const deals = Array.from({ length: count }, () => {
      const deal = createDealStore({ $isSpotPriceStreamEnabled, $isAutocalcEnabled });
      return {
        deal: createPathDeal(deal),
        calc: () => ({ status: deal.$calc.getState().status, price: deal.$calc.getState().price }),
        calculate: () => deal.actions.calculateAction(),
        hasValidationErrors: () => deal.$hasValidationErrors.getState(),
        dispose: () => deal.dispose(),
        raw: deal,
      };
    });
    return { app: "effector-model", deals, setAutocalc, options: () => deals[0].deal.getOptions() as never };
  },
};

/** A fresh page (fresh modules) with `count` deals sharing them, as tabs do. */
export const launch = async (app: AppName, count = 1): Promise<Page> => {
  vi.resetModules();
  return launchers[app](count);
};

// ---------------------------------------------------------------- reading and writing a deal by position

export type ProductRef = { groupId: string; productId: string; data: ProductData };

export const productsOf = (deal: PathDeal): ProductRef[] =>
  deal.getGroups().flatMap((group) =>
    group.productIds.map((productId) => ({ groupId: group.id, productId, data: deal.getProduct(productId)!.data })),
  );

export const fieldPathOf = (data: ProductData, fieldId: string) =>
  (definitionOf(productTypeOf(data)).fieldPaths as Record<string, string>)[fieldId];

export const pathOf = (deal: PathDeal, i: number, fieldId: string) => {
  const { groupId, productId, data } = productsOf(deal)[i];
  return productPath(groupId, productId, fieldPathOf(data, fieldId));
};

export const ops = (deal: PathDeal) => ({
  products: () => productsOf(deal),
  count: () => productsOf(deal).length,
  path: (i: number, fieldId: string) => pathOf(deal, i, fieldId),
  read: (i: number, fieldId: string) => deal.readPath(pathOf(deal, i, fieldId)),
  readAll: (fieldId: string) =>
    productsOf(deal).map(({ groupId, productId, data }) => deal.readPath(productPath(groupId, productId, fieldPathOf(data, fieldId)))),
  /** Every product's path for a field, from one read of the deal (cheap for big deals). */
  pathsOf: (fieldId: string) =>
    productsOf(deal).map(({ groupId, productId, data }) => productPath(groupId, productId, fieldPathOf(data, fieldId))),
  has: (i: number, fieldId: string) => {
    const { data } = productsOf(deal)[i];
    const parts = fieldPathOf(data, fieldId).split(".");
    const key = parts.pop()!;
    const parent = parts.reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], data);
    return typeof parent === "object" && parent !== null && key in parent;
  },
  commit: (i: number, fieldId: string, value: unknown) => deal.writePaths([{ path: pathOf(deal, i, fieldId), value }]),
  write: (writes: PathWrite[]) => deal.writePaths(writes),
  issues: (i: number, fieldId: string) =>
    deal.fieldIssues(productsOf(deal)[i].productId, fieldId as ProductFieldId).map((issue) => issue.message),
  groupIndex: (groupId: string) => deal.getGroups().findIndex((group) => group.id === groupId),
  titles: () => deal.getGroups().map((group) => group.title),
  productTitles: () => productsOf(deal).map(({ productId }) => deal.getProduct(productId)!.title),
});

// ---------------------------------------------------------------- snapshots and the change contract

/** JSON that keeps NaN, ±Infinity, -0 and undefined apart (plain JSON can't). */
export const exactJson = (value: unknown) =>
  JSON.stringify(value, (_key, item) => {
    if (typeof item === "number") {
      if (Number.isNaN(item)) return "<NaN>";
      if (!Number.isFinite(item)) return item > 0 ? "<Infinity>" : "<-Infinity>";
      if (Object.is(item, -0)) return "<-0>";
    }
    if (item === undefined) return "<undefined>";
    return item;
  });

export type ProductSnapshot = { cells: string; data: string };

export type Snapshot = {
  groups: string;
  products: Map<string, ProductSnapshot>;
  dealFields: string;
  settings: string;
  options: string;
};

const allFieldIds = (data: ProductData) => Object.keys(definitionOf(productTypeOf(data)).fieldPaths) as ProductFieldId[];

/** What the grid can show of a deal: every product cell (value, presence, issues), the deal's fields and settings. */
export const snapshot = (deal: PathDeal): Snapshot => {
  const products = new Map<string, ProductSnapshot>();
  for (const { groupId, productId, data } of productsOf(deal)) {
    const cells = allFieldIds(data).map((fieldId) => {
      const path = productPath(groupId, productId, fieldPathOf(data, fieldId));
      return [fieldId, deal.readPath(path), deal.fieldIssues(productId, fieldId).map((issue) => issue.message)];
    });
    products.set(productId, { cells: exactJson(cells), data: exactJson(data) });
  }
  return {
    groups: exactJson(deal.getGroups().map(({ id, title, productIds }) => [id, title, productIds])),
    products,
    dealFields: exactJson(["notionalCcy", "premiumCcy", "notionalAmount"].map((key) => deal.readPath(key))),
    settings: exactJson(deal.getSettings()),
    options: exactJson(deal.getOptions()),
  };
};

export type BatchReport = {
  /** Products whose cells changed, with no `products` emit naming them: stale cells. */
  missing: string[];
  /** Products named by an emit whose cells and data didn't change. */
  extra: string[];
  /** Product ids named more than once in the batch. */
  duplicates: string[];
  /** Ids emitted that aren't in the deal (removed products). */
  ghosts: string[];
  /** Kinds that changed with no emit of that kind. */
  missingKinds: string[];
  /** Kinds emitted with nothing of that kind changed. */
  extraKinds: string[];
  emits: number;
};

/** Records a deal's changes; `measure` runs one batch and checks what was emitted against what changed. */
export const recorder = (deal: PathDeal) => {
  let changes: DealChange[] = [];
  const stop = deal.subscribe((change) => changes.push(change));
  const take = () => {
    const taken = changes;
    changes = [];
    return taken;
  };
  const measure = async (batch: () => void | Promise<void>): Promise<BatchReport> => {
    await flush();
    take();
    const before = snapshot(deal);
    await batch();
    await flush();
    const emitted = take();
    const after = snapshot(deal);
    const ids = emitted.flatMap((change) => (change.kind === "products" ? change.ids : []));
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    const changed = [...after.products.keys()].filter((id) => {
      const was = before.products.get(id);
      return was && was.cells !== after.products.get(id)!.cells;
    });
    const dataChanged = new Set(
      [...after.products.keys()].filter((id) => {
        const was = before.products.get(id);
        return was && (was.cells !== after.products.get(id)!.cells || was.data !== after.products.get(id)!.data);
      }),
    );
    const kinds = new Set(emitted.map((change) => change.kind));
    const kindChanged = {
      groups: before.groups !== after.groups,
      dealFields: before.dealFields !== after.dealFields,
      settings: before.settings !== after.settings,
      options: before.options !== after.options,
    };
    return {
      missing: changed.filter((id) => !counts.has(id)),
      // a product that was already there, named although nothing of it changed (new columns don't count)
      extra: [...counts.keys()].filter((id) => before.products.has(id) && after.products.has(id) && !dataChanged.has(id)),
      duplicates: [...counts].filter(([, n]) => n > 1).map(([id]) => id),
      ghosts: [...counts.keys()].filter((id) => !after.products.has(id)),
      missingKinds: (Object.keys(kindChanged) as (keyof typeof kindChanged)[]).filter(
        (kind) => kindChanged[kind] && !kinds.has(kind),
      ),
      extraKinds: (Object.keys(kindChanged) as (keyof typeof kindChanged)[]).filter(
        (kind) => !kindChanged[kind] && kinds.has(kind),
      ),
      emits: emitted.length,
    };
  };
  return { take, stop, measure };
};

/** A deal's state by position (no ids): what every app must agree on. */
export const normalized = (handle: DealHandle) => {
  const { deal } = handle;
  const products = productsOf(deal);
  return {
    groups: deal.getGroups().map(({ title, productIds }) => ({
      title,
      products: productIds.map((id) => deal.getProduct(id)!.title),
    })),
    products: products.map(({ groupId, productId, data }) =>
      exactJson(
        allFieldIds(data).map((fieldId) => {
          const path = productPath(groupId, productId, fieldPathOf(data, fieldId));
          return [fieldId, deal.readPath(path), deal.fieldIssues(productId, fieldId).map((issue) => issue.message)];
        }),
      ),
    ),
    dealFields: exactJson(["notionalCcy", "premiumCcy", "notionalAmount"].map((key) => deal.readPath(key))),
    settings: exactJson(deal.getSettings()),
    hasValidationErrors: handle.hasValidationErrors(),
    calc: handle.calc(),
  };
};
