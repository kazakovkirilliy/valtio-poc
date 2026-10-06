import { addDeal, apps, editCell, expect, intervalProbeScript, liveIntervals, openApp, rowTexts, tab, test } from "./helpers.ts";
import { record } from "./obs.ts";

for (const app of apps) {
  test(`60 tabs: ${app}`, async ({ page }) => {
    await page.addInitScript(intervalProbeScript);
    let requests = 0;
    await page.route("https://jsonplaceholder.typicode.com/users?*", async (route) => {
      requests++;
      await route.fulfill({ json: [{ id: 4, name: "Cash D" }] });
    });
    await page.setViewportSize({ width: 1200, height: 700 });
    await openApp(page, app);
    const t0 = Date.now();
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add New Deal")!;
      for (let i = 0; i < 59; i++) button.click();
    });
    await expect(tab(page, 60)).toBeVisible({ timeout: 20000 });
    const createMs = Date.now() - t0;
    await page.waitForTimeout(2500);
    const tabsBar = await page.evaluate(() => {
      const bar = document.querySelector(".multi-deal__tabs") as HTMLElement;
      const rects = [...bar.querySelectorAll("button")].map((b) => b.getBoundingClientRect());
      return { rows: new Set(rects.map((r) => Math.round(r.top))).size, scrollW: bar.scrollWidth, clientW: bar.clientWidth, docScrollW: document.documentElement.scrollWidth, overflowX: getComputedStyle(bar).overflowX, activeIsVisible: (() => { const a = bar.querySelector(".button--active")!.getBoundingClientRect(); return a.right <= innerWidth && a.left >= 0; })() };
    });
    const intervals = await liveIntervals(page);
    // the active tab is the last; edit it, then visit tab 1 and the middle
    await editCell(page, "Strike", 1, "60");
    await tab(page, 1).click();
    const strike1 = (await rowTexts(page, "Strike"))[1];
    await tab(page, 30).click();
    const strike30 = (await rowTexts(page, "Strike"))[1];
    await tab(page, 60).click();
    const strike60 = (await rowTexts(page, "Strike"))[1];
    console.log(`MANYTABS ${app} createMs=${createMs} requests=${requests} intervals=${intervals} bar=${JSON.stringify(tabsBar)} strikes=${strike1}/${strike30}/${strike60}`);
    record("many-tabs-60", app, { requests, intervals, bar: tabsBar, strikes: [strike1, strike30, strike60] });
  });
}
