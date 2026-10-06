import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { CalcState } from "@shared/calc.ts";
import type { PathDeal } from "@shared/pathDeal.ts";
import { productPath } from "@shared/paths.ts";
import { definitionOf, productTypeOf } from "@shared/products/productRegistry.ts";

/** Scratch helpers for the event-driven battletests (Redux, Effector Nested, Effector Model; Valtio as reference). */

export const at = (relative: string) => fileURLToPath(new URL(`../../../${relative}`, import.meta.url));

export type DealHandle = {
  deal: PathDeal;
  calc(): CalcState;
  /** Distinct calculations started (by request id) since the deal was created. */
  started(): number;
  dispose(): void;
};

export type AppHandle = { newDeal(): DealHandle; dispose(): void };

export type BattleApp = "valtio" | "redux" | "effector-nested" | "effector-model";
export const battleApps: BattleApp[] = ["valtio", "redux", "effector-nested", "effector-model"];

const valtio = async (autocalc: boolean): Promise<AppHandle> => {
  vi.doMock(at("src-valtio/stores/multiTabStore.ts"), async () => {
    const { proxy } = await import("valtio");
    return { multiTabStore: proxy({ devtools: { isSpotPriceStreamEnabled: false, isAutocalcEnabled: autocalc } }) };
  });
  const { createDealStore } = await import("../../../src-valtio/stores/dealStore.ts");
  const { createPathDeal } = await import("../../../src-valtio/stores/pathDeal.ts");
  const { subscribeKey } = await import("valtio/utils");
  return {
    newDeal: () => {
      const store = createDealStore();
      const starts = new Set<number>();
      const stop = subscribeKey(
        store,
        "calc",
        (calc) => {
          if (calc.status === "calculating") starts.add(calc.requestId);
        },
        true,
      );
      return { deal: createPathDeal(store), calc: () => store.calc, started: () => starts.size, dispose: stop };
    },
    dispose: () => {},
  };
};

const redux = async (autocalc: boolean): Promise<AppHandle> => {
  const { createApp } = await import("../../../src-redux/stores/store.ts");
  const { addDeal } = await import("../../../src-redux/stores/thunks.ts");
  const { createPathDeal } = await import("../../../src-redux/stores/pathDeal.ts");
  const app = createApp({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: autocalc });
  return {
    newDeal: () => {
      const dealId = app.store.dispatch(addDeal());
      const starts = new Set<number>();
      const stop = app.store.subscribe(() => {
        const calc = app.store.getState().deals[dealId]?.calc;
        if (calc?.status === "calculating") starts.add(calc.requestId);
      });
      return {
        deal: createPathDeal(app.store, dealId),
        calc: () => app.store.getState().deals[dealId].calc,
        started: () => starts.size,
        dispose: stop,
      };
    },
    dispose: app.dispose,
  };
};

const effector = async (app: "effector-nested" | "effector-model", autocalc: boolean): Promise<AppHandle> => {
  const { createStore } = await import("effector");
  const { createDealStore, createPathDeal } =
    app === "effector-nested"
      ? {
          ...(await import("../../../src-effector-nested/stores/dealStore.ts")),
          ...(await import("../../../src-effector-nested/stores/pathDeal.ts")),
        }
      : {
          ...(await import("../../../src-effector-model/stores/dealStore.ts")),
          ...(await import("../../../src-effector-model/stores/pathDeal.ts")),
        };
  return {
    newDeal: () => {
      const store = createDealStore({
        $isSpotPriceStreamEnabled: createStore(false),
        $isAutocalcEnabled: createStore(autocalc),
      });
      const starts = new Set<number>();
      const watcher = store.$calc.watch((calc) => {
        if (calc.status === "calculating") starts.add(calc.requestId);
      });
      return {
        // both createPathDeal signatures take their own deal type
        deal: createPathDeal(store as never),
        calc: () => store.$calc.getState(),
        started: () => starts.size,
        dispose: () => {
          watcher();
          store.dispose();
        },
      };
    },
    dispose: () => {},
  };
};

/** Fresh modules, then an app that can hold several deals at once (one store / one module instance). */
export const createBattleApp = async (app: BattleApp, autocalc = false): Promise<AppHandle> => {
  vi.resetModules();
  if (app === "valtio") return valtio(autocalc);
  if (app === "redux") return redux(autocalc);
  return effector(app, autocalc);
};

/** The i-th product across groups, in display order. */
export const productAt = (deal: PathDeal, i: number) =>
  deal.getGroups().flatMap((group) => group.productIds.map((productId) => ({ groupId: group.id, productId })))[i];

export const fieldPath = (deal: PathDeal, i: number, fieldId: string) => {
  const { groupId, productId } = productAt(deal, i);
  const data = deal.getProduct(productId)!.data;
  return productPath(groupId, productId, (definitionOf(productTypeOf(data)).fieldPaths as Record<string, string>)[fieldId]);
};

export const writeField = (deal: PathDeal, i: number, fieldId: string, value: unknown) =>
  deal.writePaths([{ path: fieldPath(deal, i, fieldId), value }]);

export const readField = (deal: PathDeal, i: number, fieldId: string) => deal.readPath(fieldPath(deal, i, fieldId));

/** A Map-backed `localStorage` stand-in. */
export const createMemoryStorage = (initial: Record<string, string> = {}): Storage => {
  const items = new Map(Object.entries(initial));
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => (items.has(key) ? items.get(key)! : null),
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, String(value));
    },
  };
};
