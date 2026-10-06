import type { Page } from "@playwright/test";
import { apps, editCell, expect, openApp, test } from "./support/fixtures.ts";

const autocalc = (page: Page) => page.getByRole("switch", { name: "Autocalc" });
const calculate = (page: Page) => page.getByRole("button", { name: "Calculate" });
const price = (page: Page) => page.getByLabel("Price");

for (const app of apps) {
  test.describe(app, () => {
    test("autocalc runs once the deal is valid; the switch survives a reload", async ({ page }) => {
      await openApp(page, app);
      await expect(autocalc(page)).toBeChecked();
      await expect(calculate(page)).toBeDisabled(); // the default Notional Ccy is invalid
      await expect(price(page)).toHaveText("—");

      // valid: calculates once the deal's fixing sources have loaded (~2s round trip)
      await editCell(page, "Notional Ccy", 0, "USD");
      await expect(price(page)).toHaveText("Calculating…");
      await expect(price(page)).toHaveText("1.00", { timeout: 5000 });

      // off: an edit only outdates the price, until Calculate
      await autocalc(page).click();
      await expect(autocalc(page)).not.toBeChecked();
      await editCell(page, "Notional Amount", 1, "1000");
      await expect(price(page)).toHaveText("1.00 (outdated)");
      await calculate(page).click();
      await expect(price(page)).toHaveText("Calculating…");
      await expect(price(page)).toHaveText("2.00", { timeout: 5000 });

      await page.reload();
      await expect(page.getByText("Vanilla Group #1")).toBeVisible();
      await expect(autocalc(page)).not.toBeChecked();
    });
  });
}
