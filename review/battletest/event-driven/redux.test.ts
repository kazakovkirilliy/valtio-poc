import { afterEach, describe, expect, it, vi } from "vitest";
import type { PathDeal } from "@shared/pathDeal.ts";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { createMemoryStorage, fieldPath, readField, writeField } from "./support.ts";

/**
 * A stand-in for the Redux DevTools extension, installed before Redux
 * Toolkit loads (RTK reads `window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__` once,
 * at import). Like the extension's in-page instrument it sits innermost
 * (middleware wraps it), keeps every state, and:
 * - `jumpTo` changes the viewed state and notifies subscribers; no action
 *   goes through the middleware (the listener never sees a jump);
 * - while a past state is viewed, new actions are computed on the head and
 *   the view stays put; `getState()` (thunks, selectors) returns the view;
 * - `commit` makes the viewed state the new starting point (the monitor's
 *   "Commit"; "Import" and "Rollback" restore a state the same way).
 */
type Action = { type: string; payload?: unknown };
type Reducer = (state: unknown, action: Action) => unknown;
type Instrumented = {
  states: unknown[];
  actions: Action[];
  index: number;
  jumpTo(index: number): void;
  live(): void;
  commit(): void;
};
const instances: Instrumented[] = [];

const instrument = () => (reducer: Reducer, preloaded: unknown) => {
  let currentReducer = reducer;
  const listeners = new Set<() => void>();
  const notify = () => [...listeners].forEach((listener) => listener());
  const init = { type: "@@fake-devtools/INIT" };
  const self: Instrumented = {
    states: [currentReducer(preloaded, init)],
    actions: [init],
    index: 0,
    jumpTo(index) {
      self.index = index;
      notify();
    },
    live() {
      self.jumpTo(self.states.length - 1);
    },
    commit() {
      self.states = [self.states[self.index]];
      self.actions = [{ type: "@@fake-devtools/COMMIT" }];
      self.index = 0;
      notify();
    },
  };
  instances.push(self);
  return {
    getState: () => self.states[self.index],
    dispatch: (action: Action) => {
      const wasLive = self.index === self.states.length - 1;
      self.states.push(currentReducer(self.states[self.states.length - 1], action));
      self.actions.push(action);
      if (wasLive) self.index = self.states.length - 1;
      notify();
      return action;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    replaceReducer: (next: Reducer) => {
      currentReducer = next;
    },
  };
};

type Enhancer = (createStore: unknown) => unknown;
(globalThis as Record<string, unknown>).window = {
  __REDUX_DEVTOOLS_EXTENSION_COMPOSE__:
    () =>
    (...funcs: Enhancer[]) =>
    () =>
      funcs.reduceRight<unknown>((composed, enhancer) => enhancer(composed), instrument()),
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const loadRedux = async () => {
  vi.resetModules();
  const { combineReducers } = await import("@reduxjs/toolkit");
  const store = await import("../../../src-redux/stores/store.ts");
  const thunks = await import("../../../src-redux/stores/thunks.ts");
  const selectors = await import("../../../src-redux/stores/selectors.ts");
  const devtoolsSlice = await import("../../../src-redux/stores/devtoolsSlice.ts");
  const { dealsReducer } = await import("../../../src-redux/stores/dealsReducer.ts");
  const { optionsReducer } = await import("../../../src-redux/stores/optionsReducer.ts");
  const { tabsReducer } = await import("../../../src-redux/stores/tabsSlice.ts");
  const { createPathDeal } = await import("../../../src-redux/stores/pathDeal.ts");
  // store.ts's rootReducer, which it doesn't export
  const rootReducer = combineReducers({
    tabs: tabsReducer,
    deals: dealsReducer,
    options: optionsReducer,
    devtools: devtoolsSlice.devtoolsReducer,
  }) as unknown as Reducer;
  return { ...store, ...thunks, ...selectors, ...devtoolsSlice, rootReducer, createPathDeal };
};

type RootLike = {
  deals: Record<
    string,
    {
      dealFields: { notionalAmount: number; premiumCcy: string };
      calc: { status: string };
      groups: Record<string, { products: Record<string, { data: unknown }> }>;
    }
  >;
  options: { pending: number };
};

/** A product's field, read from a raw root state by the path the deal gives it. */
const readIn = (state: unknown, dealId: string, deal: PathDeal, i: number, fieldId: string) => {
  const [, groupId, , productId, , ...rest] = fieldPath(deal, i, fieldId).split(".");
  const data = (state as RootLike).deals[dealId].groups[groupId].products[productId].data;
  return rest.reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], data);
};

const replay = (rootReducer: Reducer, preloaded: unknown, actions: readonly Action[]) =>
  actions.reduce<unknown>((state, action) => rootReducer(state, action), preloaded);

describe("redux: is the state everything?", () => {
  it("replaying the recorded actions reproduces the state, but only on the same day (the reducers read the clock)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T12:00:00"));
    installFakeApi({ Cash: [{ id: 3, name: "Shared" }] });
    const r = await loadRedux();
    const preloaded = { devtools: { isSpotPriceStreamEnabled: false, isAutocalcEnabled: true } };
    const app = r.createApp(preloaded.devtools);
    const devtools = instances.at(-1)!;
    const dealId = app.store.dispatch(r.addDeal());
    const deal = r.createPathDeal(app.store, dealId);
    deal.addGroup("Strategy");
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    deal.writePaths([{ path: "notionalAmount", value: 500 }]);
    writeField(deal, 0, "expiryDays", 5); // derived: the reducer sets Expiry Date = today + 5
    writeField(deal, 1, "expiryDate", "2026-12-01"); // the reducer derives Expiry Days from today
    writeField(deal, 0, "settlementStyle", "Cash");
    await sleep(80);
    const recorded = app.store.getState();
    expect((recorded as RootLike).deals[dealId].calc.status).toBe("done");

    expect(replay(r.rootReducer, preloaded, devtools.actions)).toEqual(recorded); // same day: the state is everything

    vi.setSystemTime(new Date("2026-10-09T12:00:00")); // e.g. a DevTools session imported, or replayed, 3 days later
    const later = replay(r.rootReducer, preloaded, devtools.actions);
    const view = (state: unknown) => ({
      expiryDate0: readIn(state, dealId, deal, 0, "expiryDate"),
      expiryDays1: readIn(state, dealId, deal, 1, "expiryDays"),
    });
    console.log("recorded", view(recorded), "replayed 3 days later", view(later));
    expect(view(recorded)).toEqual({ expiryDate0: "2026-10-11", expiryDays1: 56 });
    expect(view(later)).toEqual({ expiryDate0: "2026-10-14", expiryDays1: 53 });
    app.dispose();
  });

  it("skipping one action on replay breaks the two-way sync: pathsWritten carries the deal fields whole", async () => {
    installFakeApi({ Cash: [{ id: 3, name: "Shared" }] });
    const r = await loadRedux();
    const preloaded = { devtools: { isSpotPriceStreamEnabled: false, isAutocalcEnabled: false } };
    const app = r.createApp(preloaded.devtools);
    const devtools = instances.at(-1)!;
    const dealId = app.store.dispatch(r.addDeal());
    const deal = r.createPathDeal(app.store, dealId);
    deal.addGroup("Strategy");
    deal.writePaths([{ path: "notionalAmount", value: 500 }]);
    deal.writePaths([{ path: "premiumCcy", value: "EUR" }]); // an unrelated, later write
    await sleep(30);
    const skipped = devtools.actions.findIndex(
      (action) =>
        action.type === "deals/pathsWritten" &&
        (action.payload as { writes: { path: string }[] }).writes.some(({ path }) => path === "notionalAmount"),
    );
    expect(skipped).toBeGreaterThan(0);

    // what the monitor's "Skip" (toggle action) computes: every other action, through the reducers
    const state = replay(r.rootReducer, preloaded, devtools.actions.filter((_, index) => index !== skipped)) as RootLike;
    expect(state.deals[dealId].dealFields.notionalAmount).toBe(500); // still there: the later action restated it
    expect([readIn(state, dealId, deal, 0, "notionalAmount"), readIn(state, dealId, deal, 1, "notionalAmount")]).toEqual([
      NaN,
      NaN,
    ]); // the products never got it: deal and products disagree (F2)
    app.dispose();
  });

  it("a deal restored from the action log alone has no spot price stream (the registry lives in extraArgument)", async () => {
    installFakeApi({ Cash: [{ id: 3, name: "Shared" }] });
    const r = await loadRedux();
    const devtoolsState = { isSpotPriceStreamEnabled: false, isAutocalcEnabled: false };
    const first = r.createApp(devtoolsState);
    const log = instances.at(-1)!;
    const dealId = first.store.dispatch(r.addDeal());
    await sleep(30);
    first.dispose();

    // DevTools "Import" / persisted session: the same actions, dispatched into a new store
    const second = r.createApp(devtoolsState);
    for (const action of log.actions.slice(1)) second.store.dispatch(action as never);
    expect(second.store.getState().deals[dealId]).toBeDefined();
    expect(second.store.dispatch(r.spotStreamOf(dealId))).toBeUndefined();
    expect(r.createPathDeal(second.store, dealId).spotPriceStream).toBeUndefined(); // the grid's deal column reads it
    second.dispose();
  });
});

describe("redux: time travel through the DevTools", () => {
  it("a jump repaints and moves the spot streams; the listener (autocalc) never sees it", async () => {
    installFakeApi({ Cash: [{ id: 3, name: "Shared" }] });
    const r = await loadRedux();
    const app = r.createApp({ isSpotPriceStreamEnabled: true, isAutocalcEnabled: true });
    const devtools = instances.at(-1)!;
    const dealId = app.store.dispatch(r.addDeal());
    const stream = app.store.dispatch(r.spotStreamOf(dealId));
    const start = vi.spyOn(stream, "start");
    const stop = vi.spyOn(stream, "stop");
    const deal = r.createPathDeal(app.store, dealId);
    deal.addGroup("VanillaGroup");
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(80);
    expect(app.store.getState().deals[dealId].calc.status).toBe("done");

    app.store.dispatch(r.spotPriceStreamToggled()); // off
    const off = devtools.index;
    expect(stop).toHaveBeenCalled();
    start.mockClear();
    devtools.jumpTo(off - 1); // back to "on"
    expect(start).toHaveBeenCalled(); // the stream follows the viewed switch
    stop.mockClear();
    devtools.live();
    expect(stop).toHaveBeenCalled();

    // a state where the price was outdated and the deal ready: nothing calculates while it's viewed
    const outdated = devtools.states.findIndex((state) => {
      const deal = (state as RootLike).deals[dealId];
      return deal?.calc.status === "none" && r.selectShouldAutocalc(state as never, dealId);
    });
    expect(outdated).toBeGreaterThan(0);
    const changes: string[] = [];
    const unsubscribe = deal.subscribe((change) => changes.push(change.kind));
    devtools.jumpTo(1); // before the group and the ccy: the grid hears the jump
    expect(changes).toEqual(expect.arrayContaining(["groups", "dealFields"]));
    devtools.jumpTo(outdated);
    await sleep(40);
    expect(app.store.getState().deals[dealId].calc.status).toBe("none"); // no calculation from a jump (as a preview should be)
    unsubscribe();
    devtools.live();
    app.dispose();
  });

  it("an edit made while a past state is viewed is routed from that state, applied to the head, and reverts the deal fields", async () => {
    installFakeApi({ Cash: [{ id: 3, name: "Shared" }] });
    const r = await loadRedux();
    const app = r.createApp({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    const devtools = instances.at(-1)!;
    const dealId = app.store.dispatch(r.addDeal());
    const deal = r.createPathDeal(app.store, dealId);
    deal.addGroup("VanillaGroup");
    await sleep(30);
    const beforeAmount = devtools.index;
    deal.writePaths([{ path: "notionalAmount", value: 500 }]);
    devtools.jumpTo(beforeAmount); // looking at the past
    deal.writePaths([{ path: "premiumCcy", value: "EUR" }]); // the thunk reads the viewed state
    devtools.live();
    const head = app.store.getState() as unknown as RootLike;
    expect(head.deals[dealId].dealFields.premiumCcy).toBe("EUR");
    expect(head.deals[dealId].dealFields.notionalAmount).toBeNaN(); // reverted by the payload's snapshot
    expect(readField(deal, 0, "notionalAmount")).toBe(500); // the product kept it: deal and products disagree
    app.dispose();
  });

  it("a state committed (or imported) while options were loading stays 'loading' for good: never ready again", async () => {
    const api = installFakeApi({ Cash: [{ id: 3, name: "Shared" }] });
    api.delays.Cash = 30;
    const r = await loadRedux();
    const app = r.createApp({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: true });
    const devtools = instances.at(-1)!;
    const dealId = app.store.dispatch(r.addDeal()); // the deal column's Cash options: pending 1
    const deal = r.createPathDeal(app.store, dealId);
    deal.addGroup("VanillaGroup");
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    const midLoad = devtools.index;
    expect(app.store.getState().options.pending).toBe(1);
    await sleep(80);
    expect([app.store.getState().options.pending, app.store.getState().deals[dealId].calc.status]).toEqual([0, "done"]);

    devtools.jumpTo(midLoad);
    devtools.commit(); // the viewed state is the new start
    deal.writePaths([{ path: "notionalAmount", value: 1000 }]);
    app.store.dispatch(r.calculate(dealId));
    await sleep(80);
    const state = app.store.getState();
    expect(state.options.pending).toBe(1); // the load it counts finished long ago: nothing will ever decrement it
    expect(r.selectIsReady(state, dealId)).toBe(false);
    expect(state.deals[dealId].calc.status).toBe("none"); // neither autocalc nor Calculate can run again
    app.dispose();
  });

  it("app.ts persists whatever state is viewed, and takes a stored non-boolean as is", async () => {
    const storage = createMemoryStorage({ "redux-devtools-settings": JSON.stringify({ isAutocalcEnabled: "false" }) });
    vi.stubGlobal("localStorage", storage);
    installFakeApi();
    vi.resetModules();
    const { app } = await import("../../../src-redux/stores/app.ts");
    const { autocalcToggled } = await import("../../../src-redux/stores/devtoolsSlice.ts");
    const devtools = instances.at(-1)!;
    expect(app.store.getState().devtools.isAutocalcEnabled).toBe("false"); // a truthy string: autocalc counts as on
    app.store.dispatch(autocalcToggled());
    const saved = () => JSON.parse(storage.getItem("redux-devtools-settings")!).isAutocalcEnabled;
    expect(saved()).toBe(false);
    devtools.jumpTo(0); // just looking at the past...
    expect(saved()).toBe("false"); // ...saved it: a reload now starts from the past value
    devtools.live();
    app.dispose();
  });
});

describe("redux: listener-middleware autocalc", () => {
  it("many deals becoming ready in one dispatch each calculate exactly once", async () => {
    const api = installFakeApi({ Cash: [{ id: 3, name: "Shared" }] });
    api.delays.Cash = 20;
    const r = await loadRedux();
    const app = r.createApp({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: true });
    const devtools = instances.at(-1)!;
    const ids = Array.from({ length: 5 }, () => app.store.dispatch(r.addDeal()));
    for (const dealId of ids) {
      const deal = r.createPathDeal(app.store, dealId);
      deal.addGroup("VanillaGroup");
      deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    }
    await sleep(80);
    const started = devtools.actions.filter((action) => action.type === "deals/calculationStarted");
    const perDeal = ids.map((dealId) => started.filter((action) => (action.payload as { dealId: string }).dealId === dealId).length);
    expect(perDeal).toEqual([1, 1, 1, 1, 1]);
    expect(ids.map((dealId) => app.store.getState().deals[dealId].calc.status)).toEqual(Array(5).fill("done"));
    app.dispose();
  });
});
