import type { Page } from "@playwright/test";
import { apps, cell, dump, editCell, expect, openApp, priceOut, rowTexts, settled, test } from "./helpers.ts";
import { paste } from "../../e2e/support/fixtures.ts";
import { record } from "./obs.ts";

const FIXING = "https://jsonplaceholder.typicode.com/users?*";
const mock = (page: Page) =>
  page.route(FIXING, async (route) => {
    await new Promise((r) => setTimeout(r, 100));
    await route.fulfill({ json: [{ id: 4, name: "Cash D" }, { id: 3, name: "Shared C" }] });
  });
const strip = (d: Record<string, string[]>) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== "Spot Stream"));
const add = (page: Page, name: string) => page.getByRole("button", { name }).click();

for (const app of apps) {
  test.describe(`model: ${app}`, () => {
    test("new products start from the deal's values (F2); clone is independent (G1); remove renumbers (G2)", async ({ page }) => {
      await mock(page);
      await openApp(page, app);
      await editCell(page, "Notional Ccy", 0, "USD");
      await editCell(page, "Notional Amount", 0, "500");
      await editCell(page, "Premium Ccy", 0, "EUR");
      await editCell(page, "Ccy Pair", 0, "GBPJPY"); // broadcast: Notional Ccy -> GBP
      await add(page, "Add Strategy");
      await add(page, "Add Average");
      await add(page, "Add Vanilla Group");
      const out: Record<string, unknown> = {};
      out.afterAdds = strip(await dump(page));
      // clone the Strategy (group 2): edits to the clone don't touch the original
      await page.getByRole("button", { name: "Clone", exact: true }).nth(1).click();
      out.titlesAfterClone = await page.locator(".grid-group__title").allTextContents();
      await editCell(page, "Strike", 2, "AAA"); // original strategy's first product
      await editCell(page, "Strike", 4, "BBB"); // the clone's first product
      await editCell(page, "Expiry Date", 3, "2999-01-01");
      out.afterCloneEdits = { strike: await rowTexts(page, "Strike"), expiry: await rowTexts(page, "Expiry Date"), titles: await page.locator(".grid-group__title").allTextContents() };
      // remove the original strategy
      await page.getByRole("button", { name: "Remove", exact: true }).nth(1).click();
      out.afterRemove = { titles: await page.locator(".grid-group__title").allTextContents(), headers: await page.locator(".deal-grid .slick-header-column.grid-header--product").allTextContents(), strike: await rowTexts(page, "Strike") };
      record("model-groups", app, out);
    });

    test("Average and Vanilla columns behave alike (validation, expiry days, delivery rule)", async ({ page }) => {
      await mock(page);
      await openApp(page, app);
      await add(page, "Add Average");
      await settled(page);
      const out: Record<string, unknown> = {};
      for (const [name, col] of [["vanilla", 1], ["average", 2]] as const) {
        const o: Record<string, unknown> = {};
        const err = async (label: string) => /grid-cell--error/.test((await (await cell(page, label, col)).getAttribute("class")) ?? "");
        await editCell(page, "Expiry Date", col, "2999-02-10");
        await editCell(page, "Delivery Date", col, "2999-02-05");
        o.deliveryBeforeExpiry = await err("Delivery Date");
        await editCell(page, "Expiry Days", col, "5");
        o.daysAfterTyping = (await rowTexts(page, "Expiry Days"))[col];
        o.deliveryErrAfterDays = await err("Delivery Date"); // delivery 2999 vs expiry today+5: fine
        await editCell(page, "Strike", col, "TOOLONG");
        o.strikeErr = await err("Strike");
        await editCell(page, "Ccy Pair", col, "eurusd");
        o.pairErr = await err("Ccy Pair");
        await editCell(page, "Ccy Pair", col, "EURUSD");
        o.pairFixed = !(await err("Ccy Pair"));
        o.notionalCcyFromPair = (await rowTexts(page, "Notional Ccy"))[col];
        await editCell(page, "Notional Amount", col, "-1");
        o.amountErr = await err("Notional Amount");
        await editCell(page, "Settlement Style", col, "Cash");
        await editCell(page, "Settlement Ccy", col, "WAYTOOLONG");
        o.settlementCcyErr = await err("Settlement Ccy");
        await editCell(page, "Settlement Style", col, "Delivery");
        o.hiddenAfterDelivery = /grid-cell--none/.test((await (await cell(page, "Settlement Ccy", col)).getAttribute("class")) ?? "");
        o.hiddenNoErr = !(await err("Settlement Ccy"));
        await editCell(page, "Settlement Style", col, "Cash");
        o.keptAfterReturn = (await rowTexts(page, "Settlement Ccy"))[col];
        o.errBackAfterReturn = await err("Settlement Ccy");
        await settled(page);
        out[name] = o;
      }
      record("vanilla-vs-average", app, out);
    });

    test("price math across product types and reload of the deal", async ({ page }) => {
      await mock(page);
      await openApp(page, app);
      await add(page, "Add Strategy");
      await add(page, "Add Average");
      await editCell(page, "Notional Ccy", 0, "USD");
      await editCell(page, "Notional Amount", 0, "2500");
      await expect(priceOut(page)).toHaveText("14.00", { timeout: 12000 }); // 4 products * (1 + 2.5)
      record("price-math", app, { price: await priceOut(page).textContent() });
    });

    test("Expiry Days on the deal column and Settlement Ccy broadcast", async ({ page }) => {
      await mock(page);
      await openApp(page, app);
      await add(page, "Add Strategy");
      await settled(page);
      const out: Record<string, unknown> = {};
      await editCell(page, "Expiry Days", 0, "9");
      out.afterDealDays = { days: await rowTexts(page, "Expiry Days"), date: await rowTexts(page, "Expiry Date") };
      await editCell(page, "Settlement Style", 1, "Cash");
      await settled(page);
      await editCell(page, "Settlement Ccy", 0, "CHF"); // broadcast: only products that show it (Cash)
      out.afterSettlementCcy = await rowTexts(page, "Settlement Ccy");
      await editCell(page, "Settlement Style", 2, "Cash");
      await settled(page);
      out.afterSecondCash = await rowTexts(page, "Settlement Ccy");
      await editCell(page, "Settlement Style", 1, "Delivery");
      await editCell(page, "Settlement Style", 1, "Cash");
      out.afterRoundTrip = await rowTexts(page, "Settlement Ccy");
      await editCell(page, "Fixing Source", 0, "Shared C");
      await settled(page);
      out.afterDealFixing = await rowTexts(page, "Fixing Source");
      record("deal-broadcasts", app, out);
    });
  });
}
