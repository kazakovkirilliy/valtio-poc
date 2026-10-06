import { apps, expect, openApp, test } from "./support/fixtures.ts";

for (const app of apps) {
  test.describe(app, () => {
    test("the deal, then the labels, then every product under its group", async ({ page }) => {
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await page.getByRole("button", { name: "Add Average" }).click();
      await expect(page.getByText("Average #3")).toBeVisible();

      const headers = page.locator(".deal-grid .slick-header-column");
      await expect(headers).toHaveText(["", "", "Deal", "", "Vanilla Product #1", "Vanilla Product #1", "Vanilla Product #2", "Average Product #1"]);
      // the settings subgrid, the deal and the labels stay in view
      await expect(page.locator(".deal-grid .slick-pane-left .slick-header-column")).toHaveText(["", "", "Deal", ""]);
      await expect(page.locator(".deal-grid .grid-group__title")).toHaveText(["Vanilla Group #1", "Strategy #2", "Average #3"]);

      // one row per field, labelled in the labels column
      const labels = await page.locator(".deal-grid .slick-cell.l3").evaluateAll((cells) =>
        cells
          .sort((a, b) => Number((a.parentElement as HTMLElement).dataset.row) - Number((b.parentElement as HTMLElement).dataset.row))
          .map((cell) => cell.textContent),
      );
      expect(labels).toHaveLength(16);
      expect(labels.slice(0, 3)).toEqual(["Notional Ccy", "Notional Amount", "Premium Ccy"]);

      // a group header spans exactly its products
      const widths = await page.evaluate(() => ({
        groups: [...document.querySelectorAll(".grid-group")].map((group) => group.getBoundingClientRect().width),
        products: [...document.querySelectorAll(".deal-grid .grid-header--product")].map((h) => h.getBoundingClientRect().width),
      }));
      const [one] = widths.products;
      expect(widths.groups.map((width) => Math.round(width / one))).toEqual([1, 2, 1]);
    });
  });
}

test("the landing page links to every app", async ({ page }) => {
  for (const [link, app] of [["Valtio", "valtio"], ["MobX", "mobx"], ["MobX-State-Tree", "mobx-state-tree"], ["mobx-keystone", "mobx-keystone"], ["Legend-State", "legend-state"], ["Redux", "redux"], ["Effector Nested", "effector-nested"], ["Effector Model", "effector-model"]] as const) {
    await page.goto("/");
    await page.getByRole("link", { name: new RegExp(`^${link} —`) }).click();
    await expect(page).toHaveURL(new RegExp(`/${app}\\.html$`));
    await expect(page.getByText("Vanilla Group #1")).toBeVisible();
  }
});
