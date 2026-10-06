import { afterEach, expect, it, vi } from "vitest";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { battleApps, createBattleApp, fieldPath } from "./support.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Indicative only (one machine, Node, no React): the store-side cost of a
 * one-cell edit and of a 300-cell paste, with 150 Strategy groups (300
 * products), through each app's PathDeal. Autocalc on, so the per-action
 * autocalc check (redux's listener predicate, the effector combines) is paid.
 */
it("store-side cost of an edit and a paste with 300 products", async () => {
  const results: Record<string, unknown> = {};
  for (const app of battleApps) {
    installFakeApi({ Cash: [{ id: 3, name: "Shared" }] });
    const handle = await createBattleApp(app, true);
    const { deal, dispose } = handle.newDeal();
    for (let i = 0; i < 150; i += 1) deal.addGroup("Strategy");
    await sleep(30);
    const paths = Array.from({ length: 300 }, (_, i) => fieldPath(deal, i, "strike"));
    let notified = 0;
    const stop = deal.subscribe(() => (notified += 1));

    const editStart = performance.now();
    for (let i = 0; i < 300; i += 1) deal.writePaths([{ path: paths[i], value: String(i % 9) }]);
    const editMs = (performance.now() - editStart) / 300;

    const pasteStart = performance.now();
    for (let round = 0; round < 5; round += 1) deal.writePaths(paths.map((path) => ({ path, value: String(round) })));
    const pasteMs = (performance.now() - pasteStart) / 5;
    await sleep(10);
    stop();
    results[app] = { msPerEdit: Number(editMs.toFixed(3)), msPerPaste: Number(pasteMs.toFixed(1)), notifications: notified };
    dispose();
    handle.dispose();
  }
  console.log("300 products:", results);
  expect(Object.keys(results)).toHaveLength(battleApps.length);
});
