import { apps, cell, editCell, expect, openApp, rowTexts, test } from "../../e2e/support/fixtures.ts";

/**
 * Browser checks of shared UI code (useOnMount, fieldEditor), every app.
 * Run: npx playwright test -c tests/battletest/shared/playwright.config.ts
 *
 * Each test asserts the CURRENT (buggy) behaviour, so a pass means the bug
 * reproduces. Names start with "BUG".
 */
for (const app of apps) {
  test.describe(app, () => {
    test("BUG useOnMount: switching back to a tab adds another Vanilla Group to its deal", async ({ page }) => {
      await openApp(page, app);
      await expect(page.locator(".grid-group")).toHaveCount(1);
      await page.getByRole("button", { name: "Add New Deal" }).click();
      await expect(page.getByRole("button", { name: "Tab 2" })).toBeVisible();
      await page.getByRole("button", { name: "Tab 1" }).click();
      await page.getByRole("button", { name: "Tab 2" }).click();
      await page.getByRole("button", { name: "Tab 1" }).click();
      // L4: a new deal starts with ONE Vanilla Group; nobody added any.
      // Observed: every remount of <Deal> (tab switch) runs useOnMount again.
      await expect(page.locator(".grid-group")).toHaveCount(3);
      await expect(page.getByText("Vanilla Group #3")).toBeVisible();
    });

    test("BUG fieldEditor: typing 1,000 into Notional Amount clears it across the deal (paste accepts 1,000)", async ({ page }) => {
      await openApp(page, app);
      await editCell(page, "Notional Amount", 1, "1500");
      await expect.poll(() => rowTexts(page, "Notional Amount")).toEqual(["1500", "1500"]);
      await editCell(page, "Notional Amount", 1, "1,000");
      // expected 1000 (paste parses "1,000" as 1000); observed: NaN, i.e. empty, synced to the deal and every product
      await expect.poll(() => rowTexts(page, "Notional Amount")).toEqual(["", ""]);
      await expect(await cell(page, "Notional Amount", 1)).not.toHaveClass(/grid-cell--error/); // and no error is shown
    });

    test("BUG deal column: Expiry Days is editable but the write is dropped", async ({ page }) => {
      await openApp(page, app);
      await editCell(page, "Expiry Days", 0, "5");
      await page.waitForTimeout(200);
      // F4 says typing N sets Expiry Date to today + N; the deal column offers the editor, then nothing happens
      expect(await rowTexts(page, "Expiry Days")).toEqual(["", ""]);
      expect(await rowTexts(page, "Expiry Date")).toEqual(["", ""]);
    });
  });
}
