import { apps, expect, openApp, test } from "./support/fixtures.ts";

for (const app of apps) {
  test.describe(app, () => {
    test("every field lines up with its label, and only the label column has labels", async ({ page }) => {
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await page.getByRole("button", { name: "Add Average" }).click();
      await expect(page.getByText("Average #3")).toBeVisible();

      const report = await page.evaluate(() => {
        const container = document.querySelector(".columns")!;
        const columns = [...container.querySelectorAll(":scope > .column, :scope > .group > .column")];
        const labelCells = [...container.querySelector(".column--labels")!.querySelectorAll(".cell")];
        const center = (el: Element) => {
          const rect = el.getBoundingClientRect();
          return rect.top + rect.height / 2;
        };
        let maxOffset = 0;
        labelCells.forEach((labelCell, row) => {
          for (const column of columns) {
            const control = column.querySelectorAll(":scope > .cell")[row]?.querySelector("input, select");
            if (control) maxOffset = Math.max(maxOffset, Math.abs(center(control) - center(labelCell)));
          }
        });
        return {
          columns: columns.length,
          cellsPerColumn: [...new Set(columns.map((c) => c.querySelectorAll(":scope > .cell").length))],
          maxOffset,
          labelElements: container.querySelectorAll("label").length,
        };
      });
      expect(report.columns).toBe(6); // deal, labels, 4 products
      expect(report.cellsPerColumn).toEqual([16]);
      expect(report.maxOffset).toBeLessThan(1);
      expect(report.labelElements).toBe(0);
    });
  });
}

test("the landing page links to every app", async ({ page }) => {
  for (const [link, app] of [["Valtio", "valtio"], ["MobX", "mobx"], ["Effector", "effector"], ["Effector Nested", "effector-nested"]] as const) {
    await page.goto("/");
    await page.getByRole("link", { name: new RegExp(`^${link} —`) }).click();
    await expect(page).toHaveURL(new RegExp(`/${app}\\.html$`));
    await expect(page.getByText("Vanilla Group #1")).toBeVisible();
  }
});
