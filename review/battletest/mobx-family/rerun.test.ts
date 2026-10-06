import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { fieldPath, trapConsole } from "./support.ts";

/**
 * Re-run scope: what re-runs (or is copied, or patched) for one write.
 */
const devtoolsOff = { isSpotPriceStreamEnabled: false, isAutocalcEnabled: false };

beforeEach(() => {
  vi.resetModules();
  installFakeApi({ Cash: [{ id: 4, name: "C4" }] });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mobx", () => {
  const createDeal = async () => {
    const mobx = await import("mobx");
    mobx.configure({ enforceActions: "always" });
    const { createDealStore } = await import("../../../src-mobx/stores/dealStore.ts");
    const deal = createDealStore(mobx.observable({ ...devtoolsOff }));
    deal.addNewGroup("Strategy");
    deal.addNewGroup("Average");
    return { mobx, deal };
  };

  it("a field's value observer re-runs only for its own field, including removes and undeclared paths nearby", async () => {
    const { mobx, deal } = await createDeal();
    const [strategyId] = deal.groupIds;
    const [watched] = deal.products;
    let runs = 0;
    const stop = mobx.autorun(() => {
      void watched.fields.settlementCcy.value;
      runs++;
    });
    const write = (fieldId: string, value: unknown) =>
      deal.writePaths([{ path: fieldPath(strategyId, watched, fieldId), value }]);
    write("strike", "1");
    write("settlementStyle", "Cash"); // a sibling key added to cashSettlement (the fixing source) …
    await sleep(20);
    write("settlementStyle", "Delivery"); // … and removed again
    deal.writePaths([{ path: `groups.${strategyId}.products.${watched.id}.data.cashSettlement.extra`, value: 1 }]);
    expect(runs).toBe(1);
    write("settlementCcy", "EUR");
    expect(runs).toBe(2);
    stop();
    deal.dispose();
  });

  it("an issues observer re-runs when its issues are recomputed with the same content (new array each time)", async () => {
    const { mobx, deal } = await createDeal();
    const [strategyId] = deal.groupIds;
    const [watched] = deal.products;
    const write = (fieldId: string, value: unknown) =>
      deal.writePaths([{ path: fieldPath(strategyId, watched, fieldId), value }]);
    write("expiryDate", "2999-03-05");
    write("deliveryDate", "2999-03-02"); // before expiry: one issue
    const seen: unknown[] = [];
    const stop = mobx.autorun(() => void seen.push(watched.fields.deliveryDate.issues));
    write("expiryDate", "2999-03-06"); // still after delivery: the same issue
    write("expiryDate", "2999-03-07");
    expect(seen.map((issues) => (issues as { message: string }[]).map(({ message }) => message))).toEqual([
      [expect.any(String)],
      [expect.any(String)],
      [expect.any(String)],
    ]);
    expect(seen[1]).not.toBe(seen[0]); // equal content, new identity: the observer re-ran twice for nothing
    stop();
    deal.dispose();
  });

  it("the 'inputs changed' reaction re-serializes every product of the deal on any one edit", async () => {
    const { deal } = await createDeal();
    for (let i = 0; i < 20; i++) deal.addNewGroup("Strategy");
    const [strategyId] = deal.groupIds;
    const [watched] = deal.products;
    const stringify = vi.spyOn(JSON, "stringify");
    deal.writePaths([{ path: fieldPath(strategyId, watched, "strike"), value: "1" }]);
    // the one call serializes the data of all 43 products, for an edit to one
    const sizes = stringify.mock.calls.map(([value]) => (Array.isArray(value) ? value.length : 0));
    expect(Math.max(...sizes)).toBe(deal.products.length);
    stringify.mockRestore();
    deal.dispose();
  });
});

describe("mobx-state-tree", () => {
  it("NaN over NaN: every writePaths re-assigns the empty notionalAmount, a patch and a re-run each time", async () => {
    const { autorun, observable } = await import("mobx");
    const { destroy, onPatch } = await import("mobx-state-tree");
    const { Deal } = await import("../../../src-mobx-state-tree/stores/dealModel.ts");
    const deal = Deal.create({}, { devtools: observable({ ...devtoolsOff }) });
    deal.addNewGroup("Strategy");
    const [strategy] = deal.groups;
    const patches: string[] = [];
    const stop = onPatch(deal, (patch) => patches.push(`${patch.op} ${patch.path}`));
    let amountRuns = 0;
    const stopAmount = autorun(() => {
      void deal.notionalAmount;
      amountRuns++;
    });
    deal.writePaths([{ path: fieldPath(strategy.id, strategy.products[0], "strike"), value: "1" }]);
    expect(patches).toEqual(["replace /notionalAmount", "replace /groups/0/products/0/data", "replace /calc"]);
    patches.length = 0;
    deal.writePaths([{ path: fieldPath(strategy.id, strategy.products[0], "strike"), value: "1" }]); // same value
    expect(patches).toEqual(["replace /notionalAmount"]); // still a change, on a field nobody wrote
    expect(amountRuns).toBe(3); // and observers of the deal's (empty) amount re-run on every edit
    deal.writePaths([{ path: "notionalAmount", value: 5 }]);
    patches.length = 0;
    deal.writePaths([{ path: fieldPath(strategy.id, strategy.products[0], "strike"), value: "1" }]);
    expect(patches).toEqual([]); // once it holds a number, unchanged writes are silent
    stop();
    stopAmount();
    destroy(deal);
  });

  it("validation is per product, not per field: one field edit re-validates all 15 fields of that product", async () => {
    const counted = { fieldIssues: 0 };
    vi.doMock("@shared/validation.ts", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@shared/validation.ts")>();
      const fieldIssues: typeof actual.fieldIssues = (...args) => {
        counted.fieldIssues++;
        return actual.fieldIssues(...args);
      };
      const productIssues: typeof actual.productIssues = (definition, data) => {
        const issues: ReturnType<typeof actual.productIssues> = {};
        for (const fieldId of Object.keys(definition.fieldPaths) as (keyof typeof issues)[]) {
          const found = fieldIssues(definition, fieldId, data);
          if (found.length) issues[fieldId] = found;
        }
        return issues;
      };
      return { ...actual, fieldIssues, productIssues };
    });
    const { autorun, observable } = await import("mobx");
    const { destroy } = await import("mobx-state-tree");
    const { Deal } = await import("../../../src-mobx-state-tree/stores/dealModel.ts");
    const deal = Deal.create({}, { devtools: observable({ ...devtoolsOff }) });
    deal.addNewGroup("Strategy");
    const [strategy] = deal.groups;
    const stop = autorun(() => deal.products.forEach((product) => void product.issues));
    counted.fieldIssues = 0;
    deal.writePaths([{ path: fieldPath(strategy.id, strategy.products[0], "strike"), value: "1" }]);
    expect(counted.fieldIssues).toBe(15); // MobX's per-field computeds: 1 (strike has no dependants)
    stop();
    destroy(deal);
  });
});

describe("mobx-keystone", () => {
  it("a write patches only its own leaf, and nothing when the value doesn't change", async () => {
    const { setGlobalConfig, onPatches } = await import("mobx-keystone");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    const { Deal } = await import("../../../src-mobx-keystone/stores/dealModel.ts");
    const deal = new Deal({});
    deal.addNewGroup("Strategy");
    const [strategy] = deal.groups;
    const patches: string[] = [];
    const stop = onPatches(deal, (forward) => forward.forEach(({ op, path }) => patches.push(`${op} /${path.join("/")}`)));
    deal.writePaths([{ path: fieldPath(strategy.id, strategy.products[0], "strike"), value: "1" }]);
    expect(patches).toEqual(["replace /groups/0/products/0/data/optionsCommon/strike"]); // no reaction: not a root store
    patches.length = 0;
    deal.writePaths([{ path: fieldPath(strategy.id, strategy.products[0], "strike"), value: "1" }]);
    expect(patches).toEqual([]);
    stop();
  });

  it("calc is a deep tree node: every calc transition is a whole-object replace patch", async () => {
    const warnings = trapConsole();
    const { setGlobalConfig, onPatches, registerRootStore, unregisterRootStore } = await import("mobx-keystone");
    const { observable } = await import("mobx");
    setGlobalConfig({ showDuplicateModelNameWarnings: false });
    const { Deal, devtoolsContext } = await import("../../../src-mobx-keystone/stores/dealModel.ts");
    const deal = new Deal({});
    devtoolsContext.set(deal, observable({ ...devtoolsOff }));
    registerRootStore(deal);
    deal.addNewGroup("VanillaGroup");
    const patches: string[] = [];
    const stop = onPatches(deal, (forward) => forward.forEach(({ op, path }) => patches.push(`${op} /${path.join("/")}`)));
    deal.writePaths([{ path: "strike", value: "1" }]);
    expect(patches).toEqual(["replace /groups/0/products/0/data/optionsCommon/strike", "replace /calc"]);
    stop();
    unregisterRootStore(deal);
    expect(warnings).toEqual([]);
  });
});

describe("JSON.stringify as change detection: NaN and ±Infinity both serialize to null", () => {
  it.each(["mobx", "valtio", "mobx-state-tree"] as const)("%s: empty amount → 1e999 (pasted) outdates the price", async (app) => {
    const { createAdapter } = await import("../../stores/support/adapters.ts");
    const deal = await createAdapter(app);
    deal.addGroup("VanillaGroup");
    deal.sync("notionalCcy", "USD");
    await sleep(20);
    deal.calculate();
    await sleep(40);
    expect(deal.calc().status).toBe("done");
    const repaints: string[] = [];
    const stop = deal.grid().subscribeCells((cells) => repaints.push(...cells.map(({ columnId, fieldId }) => `${columnId === "deal" ? "deal" : "product"}:${fieldId}`)));
    deal.sync("notionalAmount", Number("1e999")); // what parseNumber gives for a pasted "1e999"
    await sleep(0);
    process.stdout.write(`\n[${app} NaN→Infinity] ${JSON.stringify({ calc: deal.calc().status, repaints, issues: deal.issues(0, "notionalAmount") })}\n`);
    if (app === "mobx") expect(deal.calc().status).toBe("done"); // the inputs reaction saw "null" → "null": a stale price stays "done"
    else expect(deal.calc().status).toBe("outdated");
    stop();
    deal.dispose();
  });
});
