import { chromium } from "@playwright/test";
import {
  addDeal, apps, autocalcSwitch, calcButton, cell, collectConsole, dump, editCell, expect, openApp, priceOut, spotToggle, tab, test,
} from "./helpers.ts";
import { record } from "./obs.ts";

for (const app of apps) {
  test.describe(`switches: ${app}`, () => {
    test("localStorage: what is stored, and cross-page sync of the switches (D3: nested only)", async ({ context }) => {
      const a = await context.newPage();
      await openApp(a, app);
      const stored = await a.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
      const b = await context.newPage();
      await openApp(b, app);
      await autocalcSwitch(a).click();
      await spotToggle(a).click();
      await a.waitForTimeout(600);
      const bAuto = await autocalcSwitch(b).isChecked();
      const bSpot = (await spotToggle(b).textContent())?.includes("Enabled");
      const storedAfter = await a.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
      // page b reloaded sees the new values (all apps)
      await b.reload();
      await expect(b.getByText("Vanilla Group #1")).toBeVisible();
      const bAutoReload = await autocalcSwitch(b).isChecked();
      const bSpotReload = (await spotToggle(b).textContent())?.includes("Enabled");
      // then b toggles back: does a follow?
      await autocalcSwitch(b).click();
      await b.waitForTimeout(600);
      const aAuto = await autocalcSwitch(a).isChecked();
      console.log(`RESULT sync ${app} stored=${JSON.stringify(stored)} after=${JSON.stringify(storedAfter)}`);
      record("sync-across-pages", app, { bFollowsAuto: !bAuto, bFollowsSpot: !bSpot, bAfterReload: { auto: bAutoReload, spotEnabled: bSpotReload }, aFollowsB: aAuto });
    });

    test("spot stream toggle: rapid toggling ends in the right state, one timer per deal", async ({ page }) => {
      await openApp(page, app);
      await addDeal(page).click();
      for (let i = 0; i < 15; i++) await spotToggle(page).click({ delay: 0 });
      await page.waitForTimeout(300);
      const label = (await spotToggle(page).textContent())?.replace(/\s+/g, " ");
      const spot = async () => Number(await (await cell(page, "Spot Stream", 0)).textContent());
      const s0 = await spot();
      await page.waitForTimeout(1200);
      const s1 = await spot();
      record("spot-rapid-toggle", app, { label, ticking: s1 > s0 });
      expect(label).toContain("Disabled"); // 15 toggles from Enabled
      expect(s1).toBe(s0);
    });

    test("Autocalc/Calculate sequences: price text over time", async ({ page }) => {
      await openApp(page, app);
      const seen: string[] = [];
      const sample = async () => {
        const t = (await priceOut(page).textContent()) ?? "";
        if (seen.at(-1) !== t) seen.push(t);
      };
      const watch = async (ms: number) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          await sample();
          await page.waitForTimeout(60);
        }
      };
      await sample();
      await editCell(page, "Notional Ccy", 0, "USD"); // valid: autocalc
      await watch(2800);
      // edit during the calc: supersedes
      await editCell(page, "Notional Amount", 0, "1000");
      await watch(300);
      await editCell(page, "Notional Amount", 0, "2000");
      await watch(3000);
      // off; edit; outdated; calculate x2 quickly
      await autocalcSwitch(page).click();
      await editCell(page, "Strike", 1, "5");
      await watch(300);
      const disabledBefore = await calcButton(page).isDisabled();
      await calcButton(page).click();
      await watch(100);
      const disabledDuring = await calcButton(page).isDisabled();
      await watch(2800);
      // invalid edit leaves outdated; fix; autocalc back on catches up
      await editCell(page, "Strike", 1, "9999");
      await watch(300);
      const calcDisabledInvalid = await calcButton(page).isDisabled();
      await editCell(page, "Strike", 1, "9");
      await watch(300);
      await autocalcSwitch(page).click(); // on: catch-up
      await watch(3000);
      record("autocalc-sequence", app, { seen, disabledBefore, disabledDuring, calcDisabledInvalid });
    });

    test("turn autocalc off while calculating, switch tab while calculating", async ({ page }) => {
      await openApp(page, app);
      await editCell(page, "Notional Ccy", 0, "USD");
      await expect(priceOut(page)).toHaveText("Calculating…");
      await autocalcSwitch(page).click();
      await page.waitForTimeout(2600);
      const afterOff = await priceOut(page).textContent();
      await addDeal(page).click();
      await tab(page, 1).click();
      const onReturn = await priceOut(page).textContent();
      await autocalcSwitch(page).click(); // on again
      await page.waitForTimeout(100);
      const afterOn = await priceOut(page).textContent();
      await page.waitForTimeout(2600);
      const settled = await priceOut(page).textContent();
      record("autocalc-off-in-flight", app, { afterOff, onReturn, afterOn, settled });
    });

    test("Hedge Type follows Internal", async ({ page }) => {
      await openApp(page, app);
      const hedge = await cell(page, "Hedge Type", "settings");
      const res: string[] = [];
      const snap = async (label: string) => res.push(`${label}:${await hedge.textContent()}`);
      await editCell(page, "Hedge Type", "settings", "c");
      await snap("c");
      await editCell(page, "Internal", "settings", "No");
      await snap("No");
      await editCell(page, "Hedge Type", "settings", "e");
      await snap("e");
      await editCell(page, "Internal", "settings", "No");
      await snap("No again");
      await editCell(page, "Internal", "settings", "Yes");
      await snap("Yes");
      // rapid flip
      for (let i = 0; i < 6; i++) await editCell(page, "Internal", "settings", i % 2 === 0 ? "No" : "Yes");
      await snap("after 6 flips");
      // with two tabs: settings are per deal
      await addDeal(page).click();
      const t2 = await (await cell(page, "Hedge Type", "settings")).textContent();
      await tab(page, 1).click();
      res.push(`tab2 fresh: ${t2}; tab1 back: ${await (await cell(page, "Hedge Type", "settings")).textContent()} internal=${await (await cell(page, "Internal", "settings")).textContent()}`);
      record("hedge-follows-internal", app, res);
    });

    test("cross-deal coupling: tab 2's pending options and tab 1's Calculate", async ({ page }) => {
      await page.route("https://jsonplaceholder.typicode.com/users?*", async (route) => {
        await new Promise((r) => setTimeout(r, 3500));
        await route.fulfill({ json: [{ id: 1, name: "S1" }, { id: 2, name: "S2" }] });
      });
      await openApp(page, app);
      await editCell(page, "Notional Ccy", 0, "USD");
      await expect(priceOut(page)).not.toHaveText("—", { timeout: 6000 });
      await addDeal(page).click();
      await editCell(page, "Notional Ccy", 0, "USD");
      await editCell(page, "Settlement Style", 1, "Cash"); // tab 2 loads Cash options (3.5 s)
      await tab(page, 1).click();
      await editCell(page, "Strike", 1, "3"); // outdate tab 1's price
      await page.waitForTimeout(500);
      const price = await priceOut(page).textContent();
      const hint = await page.locator(".deal__calc-hint").count();
      const calcDisabled = await calcButton(page).isDisabled();
      await page.waitForTimeout(5000);
      const later = await priceOut(page).textContent();
      record("cross-deal-pending", app, { whileTab2Loads: { price, hint, calcDisabled }, later });
    });
  });
}
