import { afterAll, afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { initialDealFields } from "@shared/dealFields.ts";
import { fields } from "@shared/fields.ts";
import { daysUntil } from "@shared/lib/date.ts";
import type { DealChange, PathDeal } from "@shared/pathDeal.ts";
import { vanillaProduct } from "@shared/products/vanillaProduct.ts";
import { type AppName, type DealAdapter, appNames, createAdapter } from "../../stores/support/adapters.ts";
import { type FakeApi, installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { gridCellOf, gridCopy, gridPaste, productAt } from "./support.ts";

/**
 * Shared rules as they show through every app's PathDeal. Each test states
 * the spec'd behaviour (REQUIREMENTS.md id in its name): a FAILING test means
 * the bug reproduces in that app. Each also records what it saw; the table
 * is printed at the end (run with `rtk proxy` / plain output to see it).
 */

const outcomes: Record<string, Partial<Record<AppName, string>>> = {};
const record = (app: AppName, check: string, outcome: string) => {
  if (!outcomes[check]) outcomes[check] = {};
  outcomes[check][app] = outcome;
};
afterAll(() => {
  for (const [check, byApp] of Object.entries(outcomes)) {
    console.log(`\n### ${check}`);
    for (const app of appNames) if (byApp[app] !== undefined) console.log(`  ${app.padEnd(16)} ${byApp[app]}`);
  }
});

const proto = Object.prototype as Record<string, unknown>;
const errorText = (error: unknown) => String(error).slice(0, 70);

describe.each(appNames)("%s", (app) => {
  let adapter: DealAdapter;
  let deal: PathDeal;

  beforeEach(async () => {
    installFakeApi({ Cash: [{ id: 4, name: "C4" }, { id: 3, name: "Shared" }] });
    adapter = await createAdapter(app);
    deal = adapter.deal();
    deal.addGroup("Strategy"); // products 0 and 1
    await sleep(20);
  });
  afterEach(() => {
    delete proto.polluted;
    vi.useRealTimers();
    try {
      adapter.dispose();
    } catch {
      // a test may have broken the deal on purpose
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("P4: a product path through __proto__ or constructor.prototype doesn't pollute Object.prototype", () => {
    const product = productAt(deal, 0);
    const seen: string[] = [];
    for (const dataPath of ["__proto__.polluted", "constructor.prototype.polluted"]) {
      try {
        deal.writePaths([{ path: product.path(dataPath), value: "yes" }]);
      } catch (error) {
        seen.push(`threw ${errorText(error)}`);
      }
      seen.push(`${dataPath}: ${({} as Record<string, unknown>).polluted === "yes" ? "POLLUTED Object.prototype" : "clean"}`);
      delete proto.polluted;
    }
    record(app, "prototype pollution through writePaths", seen.join("; "));
    expect(seen.filter((line) => line.includes("POLLUTED"))).toEqual([]);
  });

  it("P4: a path under a leaf field neither throws nor replaces the field", () => {
    const strike = productAt(deal, 0).fieldPath("strike");
    deal.writePaths([{ path: strike, value: "12" }]);
    let outcome = "no throw";
    try {
      deal.writePaths([{ path: `${strike}.x`, value: 1 }]);
    } catch (error) {
      outcome = `threw ${errorText(error)}`;
    }
    const value = deal.readPath(strike);
    record(app, "write under a leaf (strike.x)", `${outcome}; strike is now ${JSON.stringify(value)}`);
    expect([outcome, value]).toEqual(["no throw", "12"]);
  });

  it("P2: Expiry Days 1e9 in a batch neither throws nor applies the batch half-way", () => {
    const strike = productAt(deal, 0).fieldPath("strike");
    const expiryDays = productAt(deal, 1).fieldPath("expiryDays");
    let outcome = "no throw";
    try {
      deal.writePaths([{ path: strike, value: "77" }, { path: expiryDays, value: 1e9 }]);
    } catch (error) {
      outcome = `threw ${errorText(error)}`;
    }
    const applied = deal.readPath(strike) === "77";
    record(app, "batch [strike, expiryDays=1e9]", `${outcome}; first write ${applied ? "applied" : "not applied"}`);
    expect(outcome).toBe("no throw");
  });

  it("O1/P3: writing the cashSettlement object can't create a Fixing Source on a Delivery product", () => {
    const product = productAt(deal, 0);
    deal.writePaths([{ path: product.path("cashSettlement"), value: { settlementCcy: "", settlementFixingSource: "4" } }]);
    const fixing = deal.readPath(product.fieldPath("settlementFixingSource"));
    record(app, "object write creates a Fixing Source on Delivery", fixing === undefined ? "refused" : `created: "${String(fixing)}"`);
    expect(fixing).toBeUndefined();
  });

  it("F2/P3: writing the notional object keeps the deal and every product in sync", () => {
    const [first, second] = [productAt(deal, 0), productAt(deal, 1)];
    deal.writePaths([{ path: first.path("optionsCommon.base.notional"), value: { notionalCcy: "EUR", amount: 5 } }]);
    const values = [deal.readPath("notionalAmount"), deal.readPath(first.fieldPath("notionalAmount")), deal.readPath(second.fieldPath("notionalAmount"))];
    record(app, "object write bypasses sync (deal, product 0, product 1)", values.map(String).join(", "));
    expect(values).toEqual([5, 5, 5]);
  });

  it("E7: after an object write, a later edit inside that object still repaints its cell", async () => {
    const product = productAt(deal, 0);
    const grid = adapter.grid();
    const seen: string[] = [];
    const stop = grid.subscribeCells((cells) => seen.push(...cells.map((cell) => `${cell.columnId}:${cell.fieldId}`)));
    const optionsCommon = (vanillaProduct.createData(initialDealFields) as { optionsCommon: { strike: string } }).optionsCommon;
    deal.writePaths([{ path: product.path("optionsCommon"), value: { ...optionsCommon, strike: "5" } }]);
    await sleep(5);
    seen.length = 0;
    deal.writePaths([{ path: product.fieldPath("strike"), value: "6" }]);
    await sleep(5);
    stop();
    const repainted = seen.includes(`${product.productId}:strike`);
    record(app, "edit after an object write repaints", `${repainted ? "yes" : "NO REPAINT"} (store holds ${JSON.stringify(deal.readPath(product.fieldPath("strike")))})`);
    expect(repainted).toBe(true);
  });

  it("P4: writing productType by path can't break the product", () => {
    const product = productAt(deal, 0);
    let outcome = "ok";
    try {
      deal.writePaths([{ path: product.path("productType"), value: "Nope" }]);
      deal.writePaths([{ path: "strike", value: "1" }]);
      adapter.grid().getCell(product.productId, "strike");
      deal.fieldIssues(product.productId, "strike");
    } catch (error) {
      outcome = `threw ${errorText(error)}`;
    }
    record(app, "productType written by path", outcome);
    expect(outcome).toBe("ok");
  });

  it("P4/P6: a ccy pair written to a product the deal doesn't have changes nothing", () => {
    deal.writePaths([{ path: "groups.nope.products.nope.data.optionsCommon.base.ccyPair", value: "EURUSD" }]);
    record(app, "ccy pair to a missing product", `notionalCcy ${String(deal.readPath("notionalCcy"))}`);
    expect(deal.readPath("notionalCcy")).toBe("1xxxxxx");
  });

  it("S2: pasting the settings of a non-internal deal (Hedge e, Internal No) gives hedge e", () => {
    const grid = adapter.grid();
    const settings = gridCellOf(grid, "settings");
    const { skipped } = gridPaste(grid, "e\nNo", { fromRow: 2, toRow: 2, fromCell: settings, toCell: settings });
    record(app, "paste settings column [e, No]", `${JSON.stringify(deal.getSettings())}, skipped ${skipped}`);
    expect(deal.getSettings()).toEqual({ isInternal: false, hedgeType: "e" });
  });

  it("S2: an Internal value that isn't Yes/No is ignored", () => {
    deal.writePaths([{ path: "isInternal", value: "maybe" }]);
    record(app, "isInternal = 'maybe'", JSON.stringify(deal.getSettings()));
    expect(deal.getSettings()).toEqual({ isInternal: true, hedgeType: "a" });
  });

  it("E4/E5: copying a Cash product's column onto a Delivery product keeps its Fixing Source", async () => {
    adapter.commit(0, "settlementStyle", "Cash");
    await sleep(30);
    adapter.commit(0, "settlementFixingSource", "3");
    const grid = adapter.grid();
    const [first, second] = grid.getColumns().slice(1).map(({ id }) => id);
    const from = gridCellOf(grid, first);
    const to = gridCellOf(grid, second);
    const text = gridCopy(grid, { fromRow: 0, toRow: fields.length - 1, fromCell: from, toCell: from });
    expect(text).toContain("Shared"); // the label of option 3
    gridPaste(grid, text, { fromRow: 0, toRow: 0, fromCell: to, toCell: to });
    const right = adapter.read(1, "settlementFixingSource");
    await sleep(40); // Cash's options reloaded and reconciled
    const settled = adapter.read(1, "settlementFixingSource");
    record(app, "copy/paste Fixing Source 'Shared' (id 3)", `right after paste ${JSON.stringify(right)}, settled ${JSON.stringify(settled)}`);
    expect(settled).toBe("3");
  });

  it("F4: Expiry Days follows the calendar past midnight, and a passed expiry is flagged", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 10, 23, 59, 0));
    // watched, as the grid watches it (MobX computeds are cached only while observed)
    const stop = adapter.grid().subscribeCells(() => {});
    onTestFinished(stop);
    adapter.commit(0, "expiryDate", "2026-03-11");
    adapter.commit(1, "expiryDate", "2026-03-10"); // today: fine
    const before = [adapter.read(0, "expiryDays"), adapter.read(1, "expiryDays")];
    vi.setSystemTime(new Date(2026, 2, 11, 0, 1, 0)); // two minutes later
    const after = [adapter.read(0, "expiryDays"), adapter.read(1, "expiryDays")];
    const issues = adapter.issues(1, "expiryDays");
    record(app, "Expiry Days across midnight [p0, p1]", `before ${before.join(",")}; after ${after.join(",")}; p1 issues ${JSON.stringify(issues)}`);
    expect(before).toEqual([1, 0]);
    expect(after).toEqual([daysUntil("2026-03-11"), daysUntil("2026-03-10")]); // [0, -1]
    expect(issues).toEqual(["Expiry date is in the past"]);
  });

  it("E7: writing values the deal already has notifies nothing", async () => {
    const seen: DealChange["kind"][] = [];
    const stop = deal.subscribe((change) => seen.push(change.kind));
    const product = productAt(deal, 0);
    deal.writePaths([
      { path: "isInternal", value: true },
      { path: "hedgeType", value: "a" },
      { path: "notionalCcy", value: "1xxxxxx" },
      { path: product.fieldPath("strike"), value: "" },
    ]);
    await sleep(10);
    stop();
    record(app, "no-op writes notify", seen.length ? seen.join(",") : "nothing");
    expect(seen).toEqual([]);
  });

  it("F3: a null broadcast goes nowhere (like an empty one)", () => {
    deal.writePaths([{ path: "strike", value: null }]);
    const strike = adapter.read(0, "strike");
    record(app, "broadcast strike = null", JSON.stringify(strike));
    expect(strike).toBe("");
  });

  it("P3: a number field written by path with a numeric string is stored as a number (or refused)", () => {
    deal.writePaths([{ path: "notionalAmount", value: "1000" }]);
    const value = adapter.read(0, "notionalAmount");
    record(app, "notionalAmount = '1000' by path", `${typeof value} ${JSON.stringify(value)}; issues ${JSON.stringify(adapter.issues(0, "notionalAmount"))}`);
    expect(typeof value).toBe("number");
  });

  it("C3: adding and removing groups re-prices the deal (autocalc on)", async () => {
    adapter.sync("notionalCcy", "EUR");
    adapter.sync("notionalAmount", 1000);
    adapter.setAutocalc(true);
    await sleep(80);
    const two = adapter.calc();
    adapter.addGroup("VanillaGroup");
    await sleep(80);
    const three = adapter.calc();
    adapter.removeGroup(0);
    adapter.removeGroup(0);
    await sleep(80);
    const none = adapter.calc();
    record(app, "price with 2, 3, 0 products", [two, three, none].map(({ status, price }) => `${status} ${price}`).join(" | "));
    expect([two, three]).toEqual([{ status: "done", price: 4 }, { status: "done", price: 6 }]);
  });
});

describe.each(appNames)("%s: options retry", (app) => {
  let adapter: DealAdapter;
  let api: FakeApi;

  beforeEach(async () => {
    api = installFakeApi({ Cash: [{ id: 4, name: "C4" }] });
    api.failing.add("Cash"); // the deal column's own load fails
    adapter = await createAdapter(app);
    adapter.addGroup("VanillaGroup");
    await sleep(20);
  });
  afterEach(() => {
    adapter.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("O7: while a failed list reloads, it shows as loading", async () => {
    expect(adapter.optionsFor("Cash").status).toBe("error");
    api.failing.delete("Cash");
    api.delays.Cash = 60;
    adapter.commit(0, "settlementStyle", "Cash"); // reloads Cash
    await sleep(10);
    const during = adapter.optionsFor("Cash").status;
    await sleep(80);
    const after = adapter.optionsFor("Cash").status;
    record(app, "Cash options status: during retry, after", `${during}, ${after}`);
    expect(during).toBe("loading");
  });
});
