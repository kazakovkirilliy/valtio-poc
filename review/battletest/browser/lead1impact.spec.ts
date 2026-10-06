import { addDeal, apps, autocalcSwitch, editCell, expect, groupTitles, openApp, priceOut, tab, test } from "./helpers.ts";
import { record } from "./obs.ts";

for (const app of apps) {
  test(`lead1 impact on price and autocalc-off: ${app}`, async ({ page }) => {
    await openApp(page, app);
    await editCell(page, "Notional Ccy", 0, "USD");
    await expect(priceOut(page)).toHaveText("1.00", { timeout: 12000 });
    await addDeal(page).click();
    await tab(page, 1).click();
    await page.waitForTimeout(300);
    const afterReturn = { price: await priceOut(page).textContent(), groups: (await groupTitles(page)).length };
    await expect(priceOut(page)).toHaveText("2.00", { timeout: 12000 }); // the invented second product is priced
    // autocalc off: a bare tab switch outdates a clean price
    await autocalcSwitch(page).click();
    await tab(page, 2).click();
    await tab(page, 1).click();
    await page.waitForTimeout(300);
    const switchOnly = { price: await priceOut(page).textContent(), groups: (await groupTitles(page)).length };
    record("lead1-impact", app, { afterReturn, switchOnly });
  });
}
