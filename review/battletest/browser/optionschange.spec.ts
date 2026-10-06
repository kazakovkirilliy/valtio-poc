import { apps, cell, editCell, expect, openApp, rowTexts, settled, test, addDeal } from "./helpers.ts";
import { record } from "./obs.ts";

for (const app of apps) {
  test(`options list changes between requests: ${app}`, async ({ page }) => {
    let n = 0;
    const lists = [
      [{ id: 1, name: "One" }, { id: 2, name: "Two" }, { id: 3, name: "Three" }],
      [{ id: 2, name: "Two" }, { id: 9, name: "Nine" }],
      [{ id: 7, name: "Seven" }],
    ];
    await page.route("https://jsonplaceholder.typicode.com/users?*", async (route) => {
      const list = lists[Math.min(n++, lists.length - 1)];
      await new Promise((r) => setTimeout(r, 80));
      await route.fulfill({ json: list });
    });
    await openApp(page, app);
    await page.getByRole("button", { name: "Add Strategy" }).click();
    await settled(page);
    const out: Record<string, unknown> = {};
    await editCell(page, "Settlement Style", 1, "Cash"); // request #2 -> [2, 9]: first is Two
    await page.waitForTimeout(1500);
    out.afterFirstCash = await rowTexts(page, "Fixing Source");
    await editCell(page, "Fixing Source", 1, "Nine");
    await editCell(page, "Settlement Style", 2, "Cash"); // request #3 -> [7]
    await page.waitForTimeout(1500);
    out.afterSecondCash = await rowTexts(page, "Fixing Source"); // product 1's Nine is no longer an option -> Seven
    await addDeal(page).click(); // request #4 -> [7] again
    await page.waitForTimeout(1500);
    out.newDealDealCell = await (await cell(page, "Fixing Source", 0)).textContent();
    out.requests = n;
    record("options-change", app, out);
    void expect;
  });
}
