import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { type BattleApp, battleApps, createBattleApp, readField, writeField } from "./support.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * HANDOFF open item: "Redux reconciles arriving options across every deal,
 * not just the deal that asked. Equivalent today." Two deals in one app;
 * deal B's own load (its deal column's Cash options) arrives with a list
 * that no longer suits deal A. Does deal A change?
 */
const twoDeals = async (app: BattleApp, variant: "list changed" | "first load failed") => {
  const api = installFakeApi({ Cash: [{ id: 3, name: "Shared" }, { id: 4, name: "C4" }] });
  const handle = await createBattleApp(app, true);
  const a = handle.newDeal();
  a.deal.addGroup("VanillaGroup");
  if (variant === "first load failed") api.failing.add("Cash");
  a.deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
  writeField(a.deal, 0, "settlementStyle", "Cash");
  await sleep(80);
  const before = {
    fixing: readField(a.deal, 0, "settlementFixingSource"),
    status: a.calc().status,
    started: a.started(),
  };

  if (variant === "first load failed") api.failing.delete("Cash");
  else api.lists.Cash = [{ id: 4, name: "C4" }]; // 3 is no longer offered
  const b = handle.newDeal(); // B loads its deal column's Cash options: nothing in A asked
  await sleep(80);
  const after = {
    fixing: readField(a.deal, 0, "settlementFixingSource"),
    status: a.calc().status,
    started: a.started(),
  };
  a.dispose();
  b.dispose();
  handle.dispose();
  return { before, after };
};

describe("options arriving for one deal", () => {
  it("change another deal in redux and both effector apps, never in valtio (list changed)", async () => {
    const seen: Record<string, unknown> = {};
    for (const app of battleApps) seen[app] = await twoDeals(app, "list changed");
    console.log("list changed", JSON.stringify(seen));
    const untouched = { before: { fixing: "3", status: "done", started: 1 }, after: { fixing: "3", status: "done", started: 1 } };
    const rewritten = { before: { fixing: "3", status: "done", started: 1 }, after: { fixing: "4", status: "done", started: 2 } };
    expect(seen).toEqual({
      valtio: untouched, // the reference: only the deal that asked reconciles
      redux: rewritten, // A's fixing source silently replaced, A's price outdated and recalculated
      "effector-nested": rewritten,
      "effector-model": rewritten,
    });
  });

  it("heal another deal's failed load in redux and both effector apps, never in valtio", async () => {
    const seen: Record<string, unknown> = {};
    for (const app of battleApps) seen[app] = await twoDeals(app, "first load failed");
    console.log("first load failed", JSON.stringify(seen));
    const fixings = Object.fromEntries(
      Object.entries(seen).map(([app, result]) => [app, (result as { after: { fixing: unknown } }).after.fixing]),
    );
    expect(fixings).toEqual({ valtio: undefined, redux: "3", "effector-nested": "3", "effector-model": "3" });
  });
});

describe("options arriving start one calculation, not two (reconcile and load-done land together)", () => {
  it.each(["redux", "effector-nested", "effector-model"] as const)("%s", async (app) => {
    const api = installFakeApi({ Cash: [{ id: 3, name: "Shared" }, { id: 4, name: "C4" }] });
    const handle = await createBattleApp(app, true);
    const { deal, calc, started, dispose } = handle.newDeal();
    deal.addGroup("VanillaGroup");
    deal.writePaths([{ path: "notionalCcy", value: "USD" }]);
    writeField(deal, 0, "settlementStyle", "Cash");
    await sleep(80);
    expect([readField(deal, 0, "settlementFixingSource"), calc().status]).toEqual(["3", "done"]);
    const before = started();
    api.lists.Cash = [{ id: 4, name: "C4" }];
    deal.cloneGroup(deal.getGroups()[0].id); // the copy, still on 3, reloads Cash's options
    await sleep(80);
    expect([readField(deal, 0, "settlementFixingSource"), readField(deal, 1, "settlementFixingSource")]).toEqual(["4", "4"]);
    expect(calc().status).toBe("done");
    expect(started() - before).toBe(1); // priced once, on the reconciled data
    dispose();
    handle.dispose();
  });
});
