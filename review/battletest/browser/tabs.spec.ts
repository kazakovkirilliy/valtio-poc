import {
  addDeal, apps, cell, dump, editCell, expect, groupTitles, intervalProbeScript, liveIntervals, openApp, priceOut, productHeaders,
  rowTexts, settled, spotToggle, tab, tabButtons, test,
} from "./helpers.ts";

const settle = (page: import("@playwright/test").Page, ms = 250) => page.waitForTimeout(ms);

for (const app of apps) {
  test.describe(`tabs: ${app}`, () => {
    test("LEAD1 switching tabs must not add groups (L4: a new deal starts with ONE group)", async ({ page }) => {
      await openApp(page, app);
      await addDeal(page).click();
      await expect(tab(page, 2)).toBeVisible();
      await settle(page);
      const counts: { t1: number; t2: number }[] = [];
      for (let i = 0; i < 4; i++) {
        await tab(page, 1).click();
        await settle(page);
        const t1 = (await groupTitles(page)).length;
        await tab(page, 2).click();
        await settle(page);
        const t2 = (await groupTitles(page)).length;
        counts.push({ t1, t2 });
      }
      console.log(`RESULT lead1 ${app} ${JSON.stringify(counts)}`);
      expect(counts.at(-1)).toEqual({ t1: 1, t2: 1 });
    });

    test("LEAD1b a deal's edits survive switching tabs (values, errors, added groups)", async ({ page }) => {
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await expect(page.getByText("Strategy #2")).toBeVisible();
      await editCell(page, "Strike", 1, "9");
      await editCell(page, "Strike", 2, "1234"); // error
      await editCell(page, "Notional Ccy", 0, "USD");
      await editCell(page, "Settlement Style", 1, "Cash");
      await expect(await cell(page, "Fixing Source", 1)).not.toHaveText("Loading…", { timeout: 15000 });
      await editCell(page, "Hedge Type", "settings", "c");
      await settle(page, 400);
      const before = await dump(page);
      const beforeTitles = await groupTitles(page);
      await addDeal(page).click();
      await expect(tab(page, 2)).toBeVisible();
      await settle(page);
      await tab(page, 1).click();
      await settle(page, 400);
      const after = await dump(page);
      const afterTitles = await groupTitles(page);
      console.log(`RESULT lead1b ${app} titles before=${JSON.stringify(beforeTitles)} after=${JSON.stringify(afterTitles)}`);
      // existing columns must be unchanged: compare the first 4 columns (deal + products 1..3) per row
      const strip = (d: Record<string, string[]>) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== "Spot Stream").map(([k, v]) => [k, v.slice(0, 4)]));
      expect(strip(after)).toEqual(strip(before));
      await expect(await cell(page, "Hedge Type", "settings")).toHaveText("c");
    });

    test("LEAD1c removing every group then switching tabs: the group must stay removed (G3)", async ({ page }) => {
      await openApp(page, app);
      await page.getByRole("button", { name: "Remove", exact: true }).first().click();
      await settle(page);
      const afterRemove = (await groupTitles(page)).length;
      await addDeal(page).click();
      await expect(tab(page, 2)).toBeVisible();
      await tab(page, 1).click();
      await settle(page, 400);
      const afterReturn = (await groupTitles(page)).length;
      console.log(`RESULT lead1c ${app} afterRemove=${afterRemove} afterReturn=${afterReturn}`);
      expect(afterReturn).toBe(afterRemove);
    });

    test("LEAD2 inactive tabs and the spot stream (timers + value continuity)", async ({ page }) => {
      await page.addInitScript(intervalProbeScript);
      await openApp(page, app);
      const base = await liveIntervals(page);
      await addDeal(page).click();
      await addDeal(page).click();
      await expect(tab(page, 3)).toBeVisible();
      await settle(page, 400);
      const withThree = await liveIntervals(page);
      const spot = async () => Number(await (await cell(page, "Spot Stream", 0)).textContent());
      const onTab3 = await spot();
      await tab(page, 1).click();
      await settle(page, 300);
      const t1a = await spot();
      await tab(page, 2).click();
      await page.waitForTimeout(2200); // tab 1 is inactive now
      await tab(page, 1).click();
      await settle(page, 300);
      const t1b = await spot();
      // toggle off: every timer must stop, including the inactive deals'
      await spotToggle(page).click();
      await settle(page, 300);
      const offIntervals = await liveIntervals(page);
      await spotToggle(page).click();
      await settle(page, 300);
      const onAgain = await liveIntervals(page);
      console.log(`RESULT lead2 ${app} intervals base=${base} with3deals=${withThree} afterOff=${offIntervals} afterOn=${onAgain}; spot tab3=${onTab3} tab1 first=${t1a} after 2.2s inactive=${t1b} (delta ${t1b - t1a})`);
      expect(offIntervals).toBe(0);
    });

    test("LEAD2b a re-mounted deal: grid values, errors and price are right", async ({ page }) => {
      await openApp(page, app);
      await editCell(page, "Notional Ccy", 0, "USD");
      await expect(priceOut(page)).toHaveText("1.00", { timeout: 8000 });
      await editCell(page, "Strike", 1, "1234"); // error: price must go outdated
      await expect(priceOut(page)).toHaveText("1.00 (outdated)");
      await addDeal(page).click();
      await expect(tab(page, 2)).toBeVisible();
      await expect(priceOut(page)).toHaveText("—"); // tab 2's own deal
      await tab(page, 1).click();
      await settle(page, 600);
      const price = await priceOut(page).textContent();
      const strike = await rowTexts(page, "Strike");
      const strikeErr = await (await cell(page, "Strike", 1)).getAttribute("class");
      console.log(`RESULT lead2b ${app} price=${price} strike=${JSON.stringify(strike)} err=${/grid-cell--error/.test(strikeErr ?? "")}`);
      expect(price).toBe("1.00 (outdated)");
      expect(strikeErr).toMatch(/grid-cell--error/);
    });

    test("MANY tabs: 12 tabs, independent deals, group churn", async ({ page }) => {
      await openApp(page, app);
      const t0 = Date.now();
      for (let i = 2; i <= 12; i++) {
        await addDeal(page).click();
        await expect(tab(page, i)).toBeVisible();
        await editCell(page, "Strike", 1, String(i));
      }
      const tabs = await tabButtons(page);
      expect(tabs).toHaveLength(13); // 12 + Add New Deal
      // visit in a shuffled order; each shows its own strike, count groups
      const seen: Record<number, { strike: string; groups: number }> = {};
      for (const i of [7, 3, 12, 1, 5, 2, 9, 4, 11, 6, 8, 10]) {
        await tab(page, i).click();
        await settle(page, 120);
        seen[i] = { strike: (await rowTexts(page, "Strike"))[1], groups: (await groupTitles(page)).length };
      }
      console.log(`RESULT many ${app} ms=${Date.now() - t0} ${JSON.stringify(seen)}`);
      // strike of tab i (i>=2) is "i"; tab 1 was never edited
      for (let i = 2; i <= 12; i++) expect.soft(seen[i].strike, `tab ${i} strike`).toBe(String(i));
      // an edit made in tab i must still be there after the shuffle; the group count must be 1 (lead 1)
      for (let i = 1; i <= 12; i++) expect.soft(seen[i].groups, `tab ${i} groups`).toBe(1);
    });

    test("group churn: add/clone/remove many, remove all, add again; tab headers renumber", async ({ page }) => {
      await openApp(page, app);
      for (let i = 0; i < 4; i++) {
        await page.getByRole("button", { name: "Add Strategy" }).click();
        await page.getByRole("button", { name: "Add Average" }).click();
        await page.getByRole("button", { name: "Add Vanilla Group" }).click();
      }
      await settle(page, 300);
      let titles = await groupTitles(page);
      expect(titles).toHaveLength(13);
      // clone the first 3 groups (each clone appears right after the original)
      for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Clone", exact: true }).nth(i * 2).click();
      await settle(page, 300);
      titles = await groupTitles(page);
      expect(titles).toHaveLength(16);
      // titles are numbered by position
      titles.forEach((t, i) => expect.soft(t).toMatch(new RegExp(`#${i + 1}$`)));
      // remove everything one by one from the last
      let n = titles.length;
      while (n > 0) {
        await page.getByRole("button", { name: "Remove", exact: true }).last().click();
        n--;
        await expect(page.locator(".deal-grid .grid-group__title")).toHaveCount(n);
      }
      expect(await productHeaders(page)).toEqual([]);
      // the calc state with no products: Calculate etc must not blow up
      await page.getByRole("button", { name: "Add Average" }).click();
      await page.getByRole("button", { name: "Add Vanilla Group" }).click();
      await settle(page, 300);
      expect(await groupTitles(page)).toEqual(["Average #1", "Vanilla Group #2"]);
      expect(await productHeaders(page)).toEqual(["Average Product #1", "Vanilla Product #1"]);
      await editCell(page, "Strike", 2, "7");
      expect(await rowTexts(page, "Strike")).toEqual(["", "", "7"]);
    });
  });
}
