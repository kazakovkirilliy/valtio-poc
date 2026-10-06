import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPathGridSource } from "@shared/grid/pathGridSource.ts";
import { fields } from "@shared/fields.ts";
import type { PathDeal } from "@shared/pathDeal.ts";
import { productPath } from "@shared/paths.ts";
import { definitionOfData } from "@shared/products/productWrites.ts";
import { type AppName, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";

/**
 * What the grid costs each app: the grid reads `fieldIssues` cell by cell in
 * a microtask, outside any reaction. A MobX computed that nothing observes is
 * recomputed on every such read (no cache), so it matters who observes it.
 */
const counted = { fieldIssues: 0 };

const mockCountingValidation = () =>
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

const print = (label: string, value: unknown) => process.stdout.write(`\n[${label}] ${JSON.stringify(value)}\n`);

const productWrite = (deal: PathDeal, groupIndex: number, productIndex: number, fieldId: string, value: unknown) => {
  const group = deal.getGroups()[groupIndex];
  const productId = group.productIds[productIndex];
  const fieldPaths = definitionOfData(deal.getProduct(productId)!.data).fieldPaths as Record<string, string>;
  return { path: productPath(group.id, productId, fieldPaths[fieldId]), value };
};

/** Every cell of the grid read once, as on a full render. */
const readAllCells = (deal: PathDeal) => {
  const grid = createPathGridSource(deal);
  for (const { id } of grid.getColumns()) for (const field of fields) grid.getCell(id, field.id);
};

beforeEach(() => {
  vi.resetModules();
  installFakeApi({ Cash: [{ id: 4, name: "C4" }] });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const apps = ["mobx", "mobx-state-tree", "mobx-keystone", "valtio"] as const satisfies readonly AppName[];

describe("field validations per grid repaint (11 products, autocalc on)", () => {
  it.each(apps)("%s", async (app) => {
    mockCountingValidation();
    const adapter = await createAdapter(app);
    adapter.setAutocalc(true); // as in the app: autocalc (and the header) observe `isReady`
    adapter.addGroup("VanillaGroup");
    for (let i = 0; i < 5; i++) adapter.addGroup("Strategy");
    const deal = adapter.deal();
    const stop = adapter.grid().subscribeCells(() => {});
    await sleep(20);
    const result: Record<string, number> = {};

    counted.fieldIssues = 0;
    deal.writePaths([productWrite(deal, 5, 1, "strike", "1")]); // the last product
    await sleep(0);
    result.invalidDealEdit = counted.fieldIssues;

    counted.fieldIssues = 0;
    readAllCells(deal);
    result.invalidDealFullRender = counted.fieldIssues;

    deal.writePaths([{ path: "notionalCcy", value: "USD" }]); // every product valid now
    await sleep(60);
    counted.fieldIssues = 0;
    deal.writePaths([productWrite(deal, 5, 1, "strike", "2")]);
    await sleep(0);
    result.validDealEdit = counted.fieldIssues;

    counted.fieldIssues = 0;
    readAllCells(deal);
    result.validDealFullRender = counted.fieldIssues;
    print(`${app} field validations`, result);
    if (app === "mobx-state-tree" || app === "mobx-keystone") {
      // while product 1 is invalid, `products.some(hasValidationErrors)` stops there: nothing
      // observes the other products' `issues`, so each cell read re-validates its whole product
      expect(result.invalidDealEdit).toBeGreaterThanOrEqual(15 * 15); // 15 cells x 15 fields
      expect(result.invalidDealFullRender).toBeGreaterThanOrEqual(10 * 15 * 15); // products 2..11
      // once valid, every product's `issues` is observed (cached): one product validation per edit
      expect(result.validDealEdit).toBeLessThanOrEqual(2 * 15);
    }
    stop();
    adapter.dispose();
  });

  it("computedRequiresReaction names the computeds read untracked (mobx-state-tree)", async () => {
    const { configure } = await import("mobx");
    const warnings: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args) => void warnings.push(args.map(String).join(" ")));
    configure({ computedRequiresReaction: true });
    try {
      const adapter = await createAdapter("mobx-state-tree");
      adapter.setAutocalc(true);
      adapter.addGroup("Strategy");
      const stop = adapter.grid().subscribeCells(() => {});
      await sleep(20);
      warnings.length = 0;
      readAllCells(adapter.deal());
      const names = [...new Set(warnings.map((w) => w.match(/Computed value '([^']+)'/)?.[1]?.replace(/\d+/g, "N")))];
      print("untracked computed reads (mst)", { count: warnings.length, names });
      expect(names).toContain("Product.issues"); // product 2's issues
      stop();
      adapter.dispose();
    } finally {
      configure({ computedRequiresReaction: false });
    }
  });
});

describe("timings at scale (ms; noisy, for orders of magnitude)", () => {
  const scaleApps = ["mobx", "mobx-state-tree", "mobx-keystone", "valtio", "zustand", "jotai"] as const satisfies readonly AppName[];
  it.each(scaleApps)("%s with 150 Strategy groups (300 products)", async (app) => {
    const adapter = await createAdapter(app);
    adapter.setAutocalc(true);
    const deal = adapter.deal();
    // time spent in JSON.stringify (MobX's inputs reaction and per-product watches serialize)
    const original = JSON.stringify;
    let stringifyMs = 0;
    const stringify = vi.spyOn(JSON, "stringify").mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      const start = performance.now();
      try {
        return original(...args);
      } finally {
        stringifyMs += performance.now() - start;
      }
    });
    let t = performance.now();
    for (let i = 0; i < 150; i++) adapter.addGroup("Strategy");
    const add = performance.now() - t;
    const addStringify = stringifyMs;
    const stop = adapter.grid().subscribeCells(() => {});
    await sleep(50);

    const time = async (run: () => void) => {
      const start = performance.now();
      run();
      await new Promise<void>((resolve) => queueMicrotask(resolve)); // the grid's flush
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return performance.now() - start;
    };
    const measure = async () => {
      const edits: number[] = [];
      stringifyMs = 0;
      for (let i = 0; i < 20; i++) edits.push(await time(() => deal.writePaths([productWrite(deal, 149, 1, "strike", String(i % 9))])));
      const editStringify = stringifyMs / 20;
      const broadcast = await time(() => deal.writePaths([{ path: "strike", value: String(Math.random()).slice(2, 4) }]));
      t = performance.now();
      readAllCells(deal);
      const fullRender = performance.now() - t;
      return {
        oneEditMedian: Number([...edits].sort((a, b) => a - b)[10].toFixed(2)),
        oneEditStringify: Number(editStringify.toFixed(2)),
        broadcastTo300: Math.round(broadcast),
        fullGridRead: Math.round(fullRender),
      };
    };
    const invalid = await measure();
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    await sleep(80);
    const valid = await measure();
    print(`${app} timings`, { add150Groups: Math.round(add), add150Stringify: Math.round(addStringify), invalid, valid });
    expect(invalid.oneEditMedian).toBeGreaterThan(0);
    stringify.mockRestore();
    stop();
    adapter.dispose();
  }, 60000);
});
