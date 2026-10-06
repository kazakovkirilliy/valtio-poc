import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PathDeal } from "@shared/pathDeal.ts";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { at } from "./support.ts";

/**
 * Real React renders, counted with <Profiler>: jsdom isn't a dependency, but
 * pnpm keeps vitest's peer copy in its store, so it is loaded from there.
 * The grid is stubbed (SlickGrid isn't the subject); `Deal` is stubbed under
 * MultiDeal so its count is MultiDeal's own.
 */
const require = createRequire(import.meta.url);
type JsdomModule = { JSDOM: new (html: string, options: Record<string, unknown>) => { window: Window & typeof globalThis } };
const { JSDOM } = require(at("node_modules/.pnpm/jsdom@30.1.1/node_modules/jsdom")) as JsdomModule;

type App = "valtio" | "legend-state" | "zustand" | "jotai";
const apps: App[] = ["valtio", "legend-state", "zustand", "jotai"];
const folder = (app: App) => `src-${app}`;

const installDom = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
  const { window } = dom;
  for (const key of ["window", "document", "navigator", "localStorage", "location", "HTMLElement", "Element", "Node", "Storage", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"] as const) {
    const value = key === "window" ? window : (window as unknown as Record<string, unknown>)[key];
    vi.stubGlobal(key, typeof value === "function" && key !== "HTMLElement" && key !== "Element" && key !== "Node" && key !== "Storage" && key !== "MutationObserver" ? (value as (...args: unknown[]) => unknown).bind(window) : value);
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  return window;
};

/** The app's real tab store and switches, with its active deal (switches off). */
const loadApp = async (app: App) => {
  if (app === "valtio") {
    const { multiTabStore, devtoolsStore } = await import("../../../src-valtio/stores/multiTabStore.ts");
    const { createPathDeal } = await import("../../../src-valtio/stores/pathDeal.ts");
    devtoolsStore.isSpotPriceStreamEnabled = false;
    devtoolsStore.isAutocalcEnabled = false;
    return {
      activeDeal: () => multiTabStore.deals[multiTabStore.activeDealId] as unknown,
      pathDealOf: (deal: unknown) => createPathDeal(deal as never),
      toggleSpotStream: () => multiTabStore.actions.toggleSpotPriceStreamEnabled(),
    };
  }
  if (app === "zustand") {
    const { multiTabStore, devtoolsStore } = await import("../../../src-zustand/stores/multiTabStore.ts");
    const { createPathDeal } = await import("../../../src-zustand/stores/pathDeal.ts");
    devtoolsStore.setState({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    return {
      activeDeal: () => multiTabStore.getState().deals[multiTabStore.getState().activeDealId] as unknown,
      pathDealOf: (deal: unknown) => createPathDeal(deal as never),
      toggleSpotStream: () => multiTabStore.getState().actions.toggleSpotPriceStreamEnabled(),
    };
  }
  if (app === "jotai") {
    const { getDefaultStore } = await import("jotai/vanilla");
    const store = getDefaultStore();
    const { multiTabStore } = await import("../../../src-jotai/stores/multiTabStore.ts");
    const { createPathDeal } = await import("../../../src-jotai/stores/pathDeal.ts");
    store.set(multiTabStore.devtoolsAtom, { isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
    return {
      activeDeal: () => store.get(multiTabStore.dealsAtom)[store.get(multiTabStore.activeDealIdAtom)] as unknown,
      pathDealOf: (deal: unknown) => createPathDeal(deal as never),
      toggleSpotStream: () => multiTabStore.actions.toggleSpotPriceStreamEnabled(),
    };
  }
  const { devtools$, multiTab$, dealStores } = await import("../../../src-legend-state/stores/multiTabStore.ts");
  const { createPathDeal } = await import("../../../src-legend-state/stores/pathDeal.ts");
  devtools$.assign({ isSpotPriceStreamEnabled: false, isAutocalcEnabled: false });
  return {
    activeDeal: () => dealStores.get(multiTab$.activeDealId.peek()) as unknown,
    pathDealOf: (deal: unknown) => createPathDeal(deal as never),
    toggleSpotStream: () => devtools$.isSpotPriceStreamEnabled.toggle(),
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock(at("src-shared/grid/DealGrid.tsx"));
  for (const app of apps) vi.doUnmock(at(`${folder(app)}/components/layout/Deal.tsx`));
});

describe.each(apps)("%s: re-renders, counted with React's Profiler", (app) => {
  it("MultiDeal never re-renders for edits; DealHeader re-renders once per keystroke (calc is replaced)", async () => {
    installFakeApi();
    const window = installDom();
    vi.resetModules();
    vi.doMock(at("src-shared/grid/DealGrid.tsx"), () => ({ DealGrid: () => null }));
    vi.doMock(at(`${folder(app)}/components/layout/Deal.tsx`), () => ({ Deal: () => null }));
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const stores = await loadApp(app);
    const { MultiDeal } = await import(`../../../${folder(app)}/components/layout/MultiDeal.tsx`);
    const { DealHeader } = await import(`../../../${folder(app)}/components/layout/DealHeader.tsx`);
    const { DealStoreProvider } = await import(`../../../${folder(app)}/components/providers/DealStoreProvider.tsx`);
    const counts = { multi: 0, header: 0 };
    const onRender = (id: string) => {
      counts[id as keyof typeof counts]++;
    };
    const { act, createElement: h, Profiler } = React;

    const multiRoot = createRoot(window.document.body.appendChild(window.document.createElement("div")));
    await act(async () => multiRoot.render(h(Profiler, { id: "multi", onRender }, h(MultiDeal))));
    const deal = stores.activeDeal();
    expect(deal).toBeDefined();
    const pathDeal: PathDeal = stores.pathDealOf(deal);
    const headerRoot = createRoot(window.document.body.appendChild(window.document.createElement("div")));
    await act(async () =>
      headerRoot.render(h(DealStoreProvider, { currentDeal: deal }, h(Profiler, { id: "header", onRender }, h(DealHeader)))),
    );
    await act(async () => {
      pathDeal.addGroup("VanillaGroup");
      pathDeal.writePaths([{ path: "notionalCcy", value: "USD" }]);
      await sleep(20);
    });
    const step = async (run: () => void) => {
      counts.multi = 0;
      counts.header = 0;
      await act(async () => {
        run();
        await sleep(5);
      });
      return { ...counts };
    };
    const [group] = pathDeal.getGroups();
    const strike = `groups.${group.id}.products.${group.productIds[0]}.data.optionsCommon.strike`;
    const result = {
      tenKeystrokes: await step(() => {
        for (let i = 0; i < 10; i++) pathDeal.writePaths([{ path: strike, value: String(i) }]);
      }),
      tenKeystrokesAwaited: { multi: 0, header: 0 },
      invalidThenStillInvalid: await step(() => {
        pathDeal.writePaths([{ path: strike, value: "1234" }]);
      }),
      toggleSpotStream: await step(() => stores.toggleSpotStream()),
      addGroup: await step(() => pathDeal.addGroup("Average")),
    };
    // one render per keystroke when each is its own task
    counts.multi = 0;
    counts.header = 0;
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        pathDeal.writePaths([{ path: strike, value: String(i) }]);
        await sleep(1);
      });
    }
    result.tenKeystrokesAwaited = { ...counts };
    await act(async () => {
      multiRoot.unmount();
      headerRoot.unmount();
    });
    console.log(`[re-renders] ${app}`, JSON.stringify(result));
    expect(result.tenKeystrokesAwaited.multi).toBe(0);
    expect(result.toggleSpotStream.multi).toBe(0);
    expect(result.addGroup.multi).toBe(0);
  });
});
