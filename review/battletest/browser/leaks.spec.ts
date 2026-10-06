import type { Page } from "@playwright/test";
import { addDeal, apps, cell, editCell, expect, groupTitles, openApp, rowTexts, tab, test } from "./helpers.ts";
import { record } from "./obs.ts";

const counters = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const c = (await cdp.send("Memory.getDOMCounters")) as { documents: number; nodes: number; jsEventListeners: number };
  const heap = (await cdp.send("Runtime.getHeapUsage")) as { usedSize: number };
  await cdp.detach();
  return { nodes: c.nodes, listeners: c.jsEventListeners, heapMB: Math.round(heap.usedSize / 1024 / 1024) };
};

for (const app of apps) {
  test(`leaks over tab switches and group churn: ${app}`, async ({ page }) => {
    await page.route("https://jsonplaceholder.typicode.com/users?*", (route) => route.fulfill({ json: [{ id: 4, name: "Cash D" }] }));
    await openApp(page, app);
    await addDeal(page).click();
    await tab(page, 1).click();
    // keep deal 1 at a constant size: remove the group each remount adds
    const trim = async () => {
      while ((await page.locator(".grid-group__title").count()) > 1) await page.getByRole("button", { name: "Remove", exact: true }).last().click();
    };
    await trim();
    const before = await counters(page);
    const t0 = Date.now();
    for (let i = 0; i < 40; i++) {
      await tab(page, 2).click();
      await tab(page, 1).click();
      await trim();
    }
    const switchMs = Date.now() - t0;
    const afterSwitches = await counters(page);
    // group churn: add and remove a Strategy 60 times
    for (let i = 0; i < 60; i++) {
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await page.getByRole("button", { name: "Remove", exact: true }).last().click();
    }
    await expect(page.locator(".grid-group__title")).toHaveCount(1);
    const afterChurn = await counters(page);
    // the cost of a synced edit now (all that churn left behind subscriptions?)
    const editStart = Date.now();
    for (let i = 0; i < 5; i++) await editCell(page, "Notional Amount", 1, String(100 + i));
    const edits = Date.now() - editStart;
    console.log(`LEAK ${app} before=${JSON.stringify(before)} afterSwitches=${JSON.stringify(afterSwitches)} afterChurn=${JSON.stringify(afterChurn)} switchMs=${switchMs} 5edits=${edits}ms`);
    record("leaks", app, { listenersGrowthSwitches: afterSwitches.listeners - before.listeners, nodesGrowthSwitches: afterSwitches.nodes - before.nodes, listenersGrowthChurn: afterChurn.listeners - afterSwitches.listeners, nodesGrowthChurn: afterChurn.nodes - afterSwitches.nodes });
    void groupTitles; void cell; void rowTexts;
  });
}
