import { activeCell } from "../../e2e/support/fixtures.ts";
import { apps, cell, expect, openApp, rowTexts, test } from "./helpers.ts";
import { record } from "./obs.ts";

for (const app of apps) {
  test(`keyboard-only editing flow (no mouse after load): ${app}`, async ({ page }) => {
    await openApp(page, app);
    await page.getByRole("button", { name: "Add Strategy" }).click();
    await expect(page.getByText("Strategy #2")).toBeVisible();
    // focus the page body, then Tab until a grid cell is active (the user's keyboard route into the grid)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    let tabs = 0;
    while (tabs < 40 && (await page.locator(".deal-grid .slick-cell.active").count()) === 0) {
      await page.keyboard.press("Tab");
      tabs++;
    }
    const entry = await page.locator(".deal-grid .slick-cell.active").count() ? await activeCell(page) : null;
    const out: Record<string, unknown> = { tabsToEnterGrid: tabs, entry };
    // from there: edit with the keyboard only
    if (entry) {
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await page.keyboard.type("4321");
      await page.keyboard.press("Enter");
      out.afterEdit = { active: await activeCell(page), amount: (await rowTexts(page, "Notional Amount")).join("|") };
      // Tab onward until it leaves the grid, then Shift+Tab back in
      let steps = 0;
      while (steps < 200 && (await page.locator(".deal-grid .slick-cell.active").count()) > 0) {
        await page.keyboard.press("Tab");
        steps++;
      }
      out.tabStepsToLeaveGrid = steps;
      out.focusAfterLeaving = await page.evaluate(() => `${document.activeElement?.tagName}.${(document.activeElement as HTMLElement | null)?.className?.toString().slice(0, 40)}:${document.activeElement?.textContent?.slice(0, 25)}`);
      await page.keyboard.press("Shift+Tab");
      out.afterShiftTab = (await page.locator(".deal-grid .slick-cell.active").count()) > 0 ? await activeCell(page) : "no active cell";
    }
    record("keyboard-flow", app, out);
  });
}
