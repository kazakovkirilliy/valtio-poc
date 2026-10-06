import { afterAll, describe, expect, it, vi } from "vitest";
import { initialDealFields } from "@shared/dealFields.ts";
import { initialDealSettings } from "@shared/dealSettings.ts";
import { routeWrites } from "@shared/dealWrites.ts";
import { fields } from "@shared/fields.ts";
import { productPath } from "@shared/paths.ts";
import type { ProductData } from "@shared/products/productRegistry.ts";
import { planProductWrites } from "@shared/products/productWrites.ts";
import { vanillaProduct } from "@shared/products/vanillaProduct.ts";
import { productIssues } from "@shared/validation.ts";
import { appNames, createAdapter } from "../../stores/support/adapters.ts";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";

/**
 * Costs of the shared code itself (no assertions beyond sanity): printed at
 * the end. Timings are wall-clock in this Node process, for orders of magnitude.
 */
const lines: string[] = [];
afterAll(() => console.log(`\n${lines.join("\n")}`));

const time = (run: () => void, times = 1) => {
  const start = performance.now();
  for (let i = 0; i < times; i++) run();
  return (performance.now() - start) / times;
};

describe("shared rules: cost per call", () => {
  const productCount = 200;
  const products = Array.from({ length: productCount }, (_, i) => ({
    groupId: `g${i}`,
    productId: `p${i}`,
    data: vanillaProduct.createData(initialDealFields) as ProductData,
  }));
  const state = { dealFields: initialDealFields, settings: initialDealSettings, products };
  const pasteAll = products.flatMap(({ groupId, productId }) =>
    Object.entries(vanillaProduct.fieldPaths)
      .filter(([fieldId]) => fieldId !== "expiryDays")
      .map(([, path]) => ({ path: productPath(groupId, productId, path), value: path.endsWith("Date") ? "2999-01-01" : "X" })),
  );

  it("routeWrites: a full-grid paste over 200 products, with and without a ccy pair in it", () => {
    const withoutPair = pasteAll.filter(({ path }) => !path.endsWith("ccyPair"));
    const plain = time(() => routeWrites(state, withoutPair), 5);
    const withPair = time(() => routeWrites(state, [...withoutPair, { path: "ccyPair", value: "EURUSD" }]), 5);
    lines.push(
      `routeWrites, ${withoutPair.length} writes / ${productCount} products: ${plain.toFixed(1)} ms; ` +
        `+ one ccy pair (the reducer replays every change with setIn): ${withPair.toFixed(1)} ms`,
    );
    expect(withPair).toBeGreaterThan(0);
  });

  it("planProductWrites and productIssues for one product", () => {
    const data = products[0].data;
    const writes = Object.keys(vanillaProduct.fieldPaths).map((fieldId) => ({ fieldId, value: "1" }) as never);
    const plan = time(() => planProductWrites(data, writes), 2000);
    const issues = time(() => productIssues(vanillaProduct as never, data), 2000);
    lines.push(`planProductWrites (16 writes): ${(plan * 1000).toFixed(1)} µs; productIssues (16 fields, zod): ${(issues * 1000).toFixed(1)} µs`);
    expect(issues).toBeGreaterThan(0);
  });
});

describe("the grid over each app's PathDeal: getCell cost (string paths built and re-parsed per cell)", () => {
  for (const app of appNames) {
    it(app, async () => {
      installFakeApi({ Cash: [{ id: 4, name: "C4" }] });
      const adapter = await createAdapter(app);
      const grid = adapter.grid();
      const measured: string[] = [];
      // 30 products, then 120: a per-cell cost that grows with the deal means a lookup per read
      for (const groupsToAdd of [15, 45]) {
        for (let i = 0; i < groupsToAdd; i++) adapter.addGroup("Strategy");
        await sleep(30);
        const columns = grid.getColumns().map(({ id }) => id);
        const everyCell = () => {
          for (const columnId of columns) for (const { id } of fields) grid.getCell(columnId, id);
        };
        everyCell(); // warm caches
        const perGrid = time(everyCell, 10);
        const perCell = (perGrid * 1000) / (columns.length * fields.length);
        measured.push(`${columns.length - 1} products: ${perGrid.toFixed(2)} ms/grid, ${perCell.toFixed(1)} µs/cell`);
      }
      lines.push(`${app.padEnd(16)} ${measured.join("  |  ")}`);
      adapter.dispose();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      expect(measured).toHaveLength(2);
    });
  }
});
