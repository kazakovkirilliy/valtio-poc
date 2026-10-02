import type { Page } from "@playwright/test";
import { apps, control, expect, openApp, test } from "./support/fixtures.ts";

const toggle = (page: Page) => page.getByRole("button", { name: /Toggle Spot Price Stream/ });
const spot = async (page: Page) => Number(await control(page, "Spot Stream", 0).inputValue());

for (const app of apps) {
  test.describe(app, () => {
    test("the spot stream follows its toggle, which survives a reload", async ({ page }) => {
      await openApp(page, app);
      await expect(toggle(page)).toContainText("Enabled");
      const before = await spot(page);
      await expect.poll(() => spot(page)).toBeGreaterThan(before);

      await toggle(page).click();
      await expect(toggle(page)).toContainText("Disabled");
      const stopped = await spot(page);
      await page.waitForTimeout(1200);
      expect(await spot(page)).toBe(stopped);

      await page.reload();
      await expect(page.getByText("Vanilla Group #1")).toBeVisible();
      await expect(toggle(page)).toContainText("Disabled");
    });

    test("tabs hold independent deals", async ({ page }) => {
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await page.getByRole("button", { name: "Add New Deal" }).click();
      await expect(page.getByRole("button", { name: "Tab 2" })).toBeVisible();
      await expect(page.getByText("Strategy #2")).toHaveCount(0); // a fresh deal
      await page.getByRole("button", { name: "Tab 1" }).click();
      await expect(page.getByText("Strategy #2")).toBeVisible();
    });
  });
}

test("effector: the toggle is kept in sync across browser tabs", async ({ context }) => {
  const first = await context.newPage();
  await openApp(first, "effector");
  const second = await context.newPage();
  await openApp(second, "effector");
  await toggle(first).click();
  await expect(toggle(second)).toContainText("Disabled");
  await toggle(first).click();
  await expect(toggle(second)).toContainText("Enabled");
});
