import { addDeal, apps, cell, editCell, expect, openApp, rowTexts, tab, test } from "./helpers.ts";
import { record } from "./obs.ts";

// the options cache is global and replaced by every load; a reload for deal 2 must not strand deal 1's value
for (const app of apps) {
  test(`cross-deal options reconcile: ${app}`, async ({ page }) => {
    let n = 0;
    const lists = [
      [{ id: 2, name: "Two" }, { id: 9, name: "Nine" }],
      [{ id: 2, name: "Two" }, { id: 9, name: "Nine" }],
      [{ id: 7, name: "Seven" }],
    ];
    await page.route("https://jsonplaceholder.typicode.com/users?*", async (route) => {
      const list = lists[Math.min(n++, lists.length - 1)];
      await new Promise((r) => setTimeout(r, 80));
      await route.fulfill({ json: list });
    });
    await openApp(page, app);
    await page.waitForTimeout(1500); // deal 1's own load (#1)
    await editCell(page, "Settlement Style", 1, "Cash"); // #2 -> [2, 9]
    await page.waitForTimeout(1500);
    await editCell(page, "Fixing Source", 1, "Nine");
    const t1Before = await rowTexts(page, "Fixing Source");
    await addDeal(page).click(); // deal 2's own load (#3) -> [7]
    await page.waitForTimeout(1500);
    await tab(page, 1).click();
    await page.waitForTimeout(500);
    const t1After = await rowTexts(page, "Fixing Source");
    // what does the editor offer, and what is selected?
    await (await cell(page, "Fixing Source", 1)).click();
    await page.keyboard.press("Enter");
    const editor = await page.locator(".grid-editor").evaluate((el) => {
      const s = el as HTMLSelectElement;
      return { value: s.value, options: [...s.options].map((o) => `${o.value}=${o.textContent}`) };
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    record("cross-deal-reconcile", app, { t1Before, t1After, editor, requests: n });
    void expect;
  });
}
