import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorage } from "./support.ts";

/**
 * D2: the two switches persist across a reload. A "reload" here is a fresh
 * module graph reading the same storage.
 */
type Switches = { isSpotPriceStreamEnabled: boolean; isAutocalcEnabled: boolean; toggleAutocalcEnabled(): void };

const apps = {
  mobx: {
    key: "mobx-devtools",
    load: async (): Promise<Switches> => (await import("../../../src-mobx/stores/multiTabStore.ts")).multiTabStore.devtools,
  },
  "mobx-state-tree": {
    key: "mobx-state-tree-devtools",
    load: async (): Promise<Switches> => (await import("../../../src-mobx-state-tree/stores/multiTabStore.ts")).devtools,
  },
  "mobx-keystone": {
    key: "mobx-keystone-devtools",
    load: async (): Promise<Switches> => {
      const { setGlobalConfig } = await import("mobx-keystone");
      setGlobalConfig({ showDuplicateModelNameWarnings: false });
      return (await import("../../../src-mobx-keystone/stores/multiTabStore.ts")).multiTabStore.devtools;
    },
  },
};

describe.each(Object.keys(apps) as (keyof typeof apps)[])("%s switches", (app) => {
  const { key, load } = apps[app];
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("default on, persisted on toggle, read back after a reload", async () => {
    const storage = installLocalStorage();
    const first = await load();
    expect([first.isSpotPriceStreamEnabled, first.isAutocalcEnabled]).toEqual([true, true]);
    first.toggleAutocalcEnabled();
    expect(JSON.parse(storage.getItem(key)!)).toEqual({ isSpotPriceStreamEnabled: true, isAutocalcEnabled: false });
    vi.resetModules();
    const reloaded = await load();
    expect(reloaded.isAutocalcEnabled).toBe(false);
  });

  it("a corrupt entry falls back to the defaults", async () => {
    installLocalStorage({ [key]: "{not json" });
    const switches = await load();
    expect(switches.isAutocalcEnabled).toBe(true);
  });

  it("an entry of the wrong type (hand-edited, or an older format)", async () => {
    installLocalStorage({ [key]: JSON.stringify({ isAutocalcEnabled: "false" }) });
    let outcome: string;
    try {
      const switches = await load();
      outcome = `loaded: ${JSON.stringify(switches.isAutocalcEnabled)}`;
    } catch (error) {
      outcome = `throws at import: ${String(error).slice(0, 90)}`;
    }
    process.stdout.write(`\n[${app} wrong-type entry] ${outcome}\n`);
    if (app === "mobx-state-tree") expect(outcome).toMatch(/^throws at import/); // the whole app fails to start
    else expect(outcome).toBe('loaded: "false"'); // a truthy string: autocalc stays on
  });
});
