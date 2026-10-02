import { apps, commitText, control, expect, hasError, openApp, test, values } from "./support/fixtures.ts";

for (const app of apps) {
  test.describe(app, () => {
    test.beforeEach(async ({ page }) => {
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await expect(page.getByText("Strategy #2")).toBeVisible();
    });

    test("fields commit on Enter or blur, never while typing", async ({ page }) => {
      // the deal's ccy: typing doesn't sync, Enter does
      await control(page, "Notional Ccy", 0).fill("EUR");
      expect((await values(page, "Notional Ccy")).slice(1)).toEqual(["1xxxxxx", "1xxxxxx", "1xxxxxx"]);
      await control(page, "Notional Ccy", 0).press("Enter");
      expect(await values(page, "Notional Ccy")).toEqual(["EUR", "EUR", "EUR", "EUR"]);

      // a product's ccy: typing doesn't reach the deal, blur does
      await control(page, "Premium Ccy", 2).fill("USD");
      expect((await values(page, "Premium Ccy"))[0]).toBe("2");
      await control(page, "Premium Ccy", 2).blur();
      expect(await values(page, "Premium Ccy")).toEqual(["USD", "USD", "USD", "USD"]);

      // validation runs on commit
      await control(page, "Strike", 1).fill("1234");
      expect(await hasError(page, "Strike", 1)).toBe(false);
      await control(page, "Strike", 1).press("Enter");
      expect(await hasError(page, "Strike", 1)).toBe(true);

      // numbers: committed as numbers; cleared shows empty, not 0
      await commitText(page, "Notional Amount", 1, "1500");
      await expect(control(page, "Notional Amount", 1)).toHaveValue("1500");
      await commitText(page, "Notional Amount", 1, "");
      await expect(control(page, "Notional Amount", 1)).toHaveValue("");

      // broadcasts: nothing sent while typing; on Enter every product, and the deal field clears
      await control(page, "Ccy Pair", 0).fill("EURUSD");
      expect((await values(page, "Ccy Pair")).slice(1)).toEqual(["", "", ""]);
      await control(page, "Ccy Pair", 0).press("Enter");
      expect(await values(page, "Ccy Pair")).toEqual(["", "EURUSD", "EURUSD", "EURUSD"]);

      // Enter then blur commits once
      await commitText(page, "Strike", 2, "9");
      await control(page, "Strike", 2).blur();
      await expect(control(page, "Strike", 2)).toHaveValue("9");
    });

    test("Delivery Date can't be before Expiry Date", async ({ page }) => {
      for (const n of [1, 2]) {
        await commitText(page, "Expiry Date", n, "2999-02-10");
        await commitText(page, "Delivery Date", n, "2999-02-05");
        expect(await hasError(page, "Delivery Date", n)).toBe(true);
        expect(await hasError(page, "Expiry Date", n)).toBe(false);
        await commitText(page, "Expiry Date", n, "2999-02-01");
        expect(await hasError(page, "Delivery Date", n)).toBe(false);
      }
      // a broadcast of a later expiry flags the products, a later delivery clears them
      await commitText(page, "Expiry Date", 0, "2999-06-01");
      expect(await hasError(page, "Delivery Date", 1)).toBe(true);
      expect(await hasError(page, "Delivery Date", 2)).toBe(true);
      expect(await hasError(page, "Delivery Date", 0)).toBe(false);
      await commitText(page, "Delivery Date", 0, "2999-06-02");
      expect(await hasError(page, "Delivery Date", 1)).toBe(false);
      expect(await hasError(page, "Delivery Date", 2)).toBe(false);
    });
  });
}
