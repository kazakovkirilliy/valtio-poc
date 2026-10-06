import type { Page } from "@playwright/test";
import { addDeal, apps, autocalcSwitch, calcButton, cell, editCell, expect, openApp, priceOut, tab, test } from "./helpers.ts";
import { record } from "./obs.ts";

const watcher = (page: Page) => {
  const seen: string[] = [];
  const t0 = Date.now();
  const sample = async () => {
    const t = (await priceOut(page).textContent()) ?? "";
    if (seen.at(-1) !== t) seen.push(t);
  };
  const watch = async (ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await sample();
      await page.waitForTimeout(50);
    }
  };
  return { seen, watch, sample, t0 };
};

for (const app of apps) {
  test.describe(`calc: ${app}`, () => {
    test("structural changes (add/clone/remove group) outdate the price and autocalc recalculates", async ({ page }) => {
      await openApp(page, app);
      await editCell(page, "Notional Ccy", 0, "USD");
      await editCell(page, "Notional Amount", 0, "1000");
      const w = watcher(page);
      await w.watch(300);
      await expect(priceOut(page)).toHaveText("2.00", { timeout: 9000 });
      const out: Record<string, string[]> = {};
      const step = async (name: string, action: () => Promise<void>, ms = 3600) => {
        w.seen.length = 0;
        await action();
        await w.sample();
        await w.watch(ms);
        out[name] = [...w.seen];
      };
      await step("add group", () => page.getByRole("button", { name: "Add Vanilla Group" }).click());
      await step("clone group", () => page.getByRole("button", { name: "Clone", exact: true }).first().click());
      await step("remove group", () => page.getByRole("button", { name: "Remove", exact: true }).last().click());
      // autocalc off: structural changes only outdate
      await autocalcSwitch(page).click();
      await step("autocalc off: add group", () => page.getByRole("button", { name: "Add Average" }).click(), 800);
      await step("autocalc off: remove group", () => page.getByRole("button", { name: "Remove", exact: true }).last().click(), 800);
      record("calc-structural", app, out);
    });

    test("tab switch back during a calculation, and a calculation response arriving for a hidden tab", async ({ page }) => {
      await openApp(page, app);
      await editCell(page, "Notional Ccy", 0, "USD");
      await editCell(page, "Notional Amount", 0, "1000");
      await expect(priceOut(page)).toHaveText("Calculating…", { timeout: 6000 });
      await addDeal(page).click(); // hide tab 1 mid-calculation
      const t2 = await priceOut(page).textContent();
      await page.waitForTimeout(3000);
      await tab(page, 1).click();
      const w = watcher(page);
      await w.sample();
      await w.watch(4000);
      record("calc-hidden-tab", app, { tab2: t2, tab1Seen: w.seen, groups: await page.locator(".grid-group__title").count() });
    });

    test("Calculate button while calculating / double click", async ({ page }) => {
      await openApp(page, app);
      await autocalcSwitch(page).click();
      await editCell(page, "Notional Ccy", 0, "USD");
      await expect(calcButton(page)).toBeEnabled({ timeout: 5000 });
      await calcButton(page).click();
      await calcButton(page).click({ force: true, timeout: 500 }).catch(() => undefined);
      const w = watcher(page);
      await w.sample();
      await w.watch(3000);
      record("calc-double-click", app, { seen: w.seen });
    });

    test("deal with zero products: Calculate/autocalc", async ({ page }) => {
      await openApp(page, app);
      await editCell(page, "Notional Ccy", 0, "USD");
      await expect(priceOut(page)).toHaveText("1.00", { timeout: 9000 });
      await page.getByRole("button", { name: "Remove", exact: true }).first().click();
      const w = watcher(page);
      await w.sample();
      await w.watch(3500);
      const disabled = await calcButton(page).isDisabled();
      const dealNotionalCcy = await (await cell(page, "Notional Ccy", 0)).textContent();
      record("calc-zero-products", app, { seen: w.seen, disabled, dealNotionalCcy });
    });
  });
}
