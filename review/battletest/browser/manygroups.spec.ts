import type { Page } from "@playwright/test";
import { apps, cell, editCell, expect, openApp, paste, rowTexts, test } from "./helpers.ts";
import { record } from "./obs.ts";

/** Runs `fn` in the page and resolves with ms until two animation frames after it. */
const timed = (page: Page, fn: () => void) =>
  page.evaluate(
    (src) =>
      new Promise<number>((resolve) => {
        const t0 = performance.now();
        new Function(src)();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(Math.round(performance.now() - t0))));
      }),
    `(${fn.toString()})()`,
  );

for (const app of apps) {
  test(`many groups: ${app}`, async ({ page }) => {
    await page.route("https://jsonplaceholder.typicode.com/users?*", (route) => route.fulfill({ json: [{ id: 4, name: "Cash D" }] }));
    await openApp(page, app);
    const out: Record<string, unknown> = {};
    const click = (text: string, n: number) => page.evaluate(([t, count]) => {
      const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === t)!;
      const t0 = performance.now();
      for (let i = 0; i < (count as number); i++) button.click();
      return Math.round(performance.now() - t0);
    }, [text, n] as const);
    out.add30StrategiesMs = await click("Add Strategy", 30);
    await expect(page.locator(".deal-grid .grid-group__title")).toHaveCount(31);
    out.products = await page.locator(".deal-grid .slick-header-column.grid-header--product").count();
    // an edit of a synced field (every product repaints its row)
    const t = Date.now();
    await editCell(page, "Notional Amount", 1, "123");
    await expect.poll(async () => (await rowTexts(page, "Notional Amount")).at(-1) ?? "", { timeout: 15000 }).toBe("123");
    out.syncedEditMs = Date.now() - t;
    // a broadcast of Cash with a request
    const t2 = Date.now();
    await editCell(page, "Settlement Style", 0, "Cash");
    await expect.poll(async () => (await rowTexts(page, "Settlement Style")).at(-1) ?? "", { timeout: 15000 }).toBe("Cash");
    out.broadcastMs = Date.now() - t2;
    // a big paste into the products
    const rowsTsv = Array.from({ length: 16 }, (_, r) => Array.from({ length: 60 }, (_, c) => (r === 1 ? String(c + 1) : r === 9 ? String(c) : "")).join("\t")).join("\n");
    await (await cell(page, "Notional Ccy", 1)).click();
    out.paste16x60Ms = await page.evaluate((text) => new Promise<number>((resolve) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      const t0 = performance.now();
      document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      const sync = Math.round(performance.now() - t0);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(sync * 1000 + Math.round(performance.now() - t0))));
    }), rowsTsv);
    // remove them all (clicking Remove on the last group 31 times)
    out.removeAllMs = await page.evaluate(() => {
      const t0 = performance.now();
      for (let i = 0; i < 31; i++) {
        const buttons = [...document.querySelectorAll<HTMLButtonElement>('.grid-group__action[aria-label="Remove"]')];
        buttons.at(-1)?.click();
      }
      return Math.round(performance.now() - t0);
    });
    await page.waitForTimeout(300);
    out.groupsLeft = await page.locator(".deal-grid .grid-group__title").count();
    console.log(`PERF many ${app} ${JSON.stringify(out)}`);
    record("many-groups-perf", app, { products: out.products, groupsLeft: out.groupsLeft });
  });
}
