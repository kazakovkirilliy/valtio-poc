import type { Page } from "@playwright/test";
import { dateInDays } from "../../../src-shared/lib/date.ts";
import { apps, cell, dump, editCell, expect, openApp, paste, priceOut, rowTexts, test } from "./helpers.ts";
import { record } from "./obs.ts";

const activeLabel = (page: Page) =>
  page.locator(".deal-grid .slick-cell.active").evaluate((active) => {
    const row = (active.parentElement as HTMLElement).dataset.row;
    const idx = Number([...active.classList].find((n) => /^l\d+$/.test(n))!.slice(1));
    const labels = document.querySelector(`.deal-grid .slick-row[data-row="${row}"] > .slick-cell.${idx === 1 ? "l0" : "l3"}`)?.textContent;
    return `${labels}@${idx === 1 ? "settings" : idx === 2 ? "deal" : `p${idx - 3}`}`;
  }).catch(() => "none");
const hasErr = async (page: Page, label: string, col: number) => /grid-cell--error/.test((await (await cell(page, label, col)).getAttribute("class")) ?? "");

for (const app of apps) {
  test.describe(`editing: ${app}`, () => {
    test.beforeEach(async ({ page }) => {
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await expect(page.getByText("Strategy #2")).toBeVisible();
    });

    test("number editor: typed junk", async ({ page }) => {
      const out: Record<string, unknown> = {};
      for (const text of ["12abc", "1e3", "0x10", "-5", "0", " 12 ", "1,000", "Infinity", "1.5", "007", "1e400", ".5", "5.", "--1", "٣", "1_000", "+7"]) {
        await editCell(page, "Notional Amount", 1, text);
        await page.waitForTimeout(40);
        out[text] = { shown: (await rowTexts(page, "Notional Amount")).join("|"), err: [await hasErr(page, "Notional Amount", 1), await hasErr(page, "Notional Amount", 0), await hasErr(page, "Notional Amount", 3)] };
      }
      record("number-junk", app, out);
    });

    test("Expiry Days writes", async ({ page }) => {
      const out: Record<string, unknown> = {};
      await editCell(page, "Expiry Date", 1, "2999-01-01");
      for (const text of ["5", "0", "-3", "2.5", "abc", "", "1e3", "100000", "99999999999", "1,5", "07"]) {
        await editCell(page, "Expiry Days", 1, text);
        await page.waitForTimeout(40);
        const expiryDate = (await rowTexts(page, "Expiry Date"))[1];
        out[text] = {
          days: (await rowTexts(page, "Expiry Days"))[1],
          date: expiryDate === dateInDays(5) ? "today+5" : expiryDate === dateInDays(0) ? "today" : expiryDate,
          errDays: await hasErr(page, "Expiry Days", 1),
          errDate: await hasErr(page, "Expiry Date", 1),
          errDelivery: await hasErr(page, "Delivery Date", 1),
        };
      }
      // Expiry Days on the deal column (broadcast? it is a deal row)
      out.dealCellText = (await rowTexts(page, "Expiry Days"))[0];
      record("expiry-days", app, out);
    });

    test("weird dates (pasted: the date editor refuses malformed text)", async ({ page }) => {
      const out: Record<string, unknown> = {};
      for (const text of ["2999-02-30", "2999-13-01", "0000-01-01", "9999-12-31", "2024-1-5", "abc", "2999-12-31", "1970-01-01", ""]) {
        await (await cell(page, "Expiry Date", 1)).click();
        await paste(page, text === "" ? "\n" : text);
        await page.waitForTimeout(40);
        out[text || "(empty)"] = { date: (await rowTexts(page, "Expiry Date"))[1], days: (await rowTexts(page, "Expiry Days"))[1], err: await hasErr(page, "Expiry Date", 1), errDays: await hasErr(page, "Expiry Days", 1), status: await page.locator(".deal-grid__status").textContent() };
      }
      record("date-junk", app, out);
    });

    test("keys: Tab/Enter/Escape sequences and type-over", async ({ page }) => {
      const out: Record<string, unknown> = {};
      await (await cell(page, "Notional Amount", 1)).click();
      await page.keyboard.type("12");
      await page.keyboard.press("Tab");
      out.afterTypeTab = { active: await activeLabel(page), amount: (await rowTexts(page, "Notional Amount")).join("|") };
      await page.keyboard.type("2999-05-05"); // type over Expiry Date
      await page.keyboard.press("Tab");
      out.afterDateTab = { active: await activeLabel(page), date: (await rowTexts(page, "Expiry Date"))[1] };
      await page.keyboard.type("77");
      await page.keyboard.press("Escape");
      out.afterEscape = { active: await activeLabel(page), strike: (await rowTexts(page, "Strike"))[1] };
      await page.keyboard.press("Enter");
      await page.keyboard.type("77");
      await page.keyboard.press("Enter");
      out.afterEnterEnter = { active: await activeLabel(page), strike: (await rowTexts(page, "Strike"))[1] };
      // Enter on a read-only cell
      await (await cell(page, "Spot Stream", 0)).click();
      await page.keyboard.press("Enter");
      out.enterOnReadonly = { editors: await page.locator(".grid-editor").count() };
      await page.keyboard.press("Escape");
      // Shift+Tab out of the first / Tab out of the last cells
      await (await cell(page, "Notional Amount", 1)).click();
      await page.keyboard.press("Shift+Tab");
      out.shiftTabFromFirst = await activeLabel(page);
      // Delete / Backspace on a selected cell (spreadsheet-style clear?)
      await (await cell(page, "Strike", 1)).click();
      await page.keyboard.press("Delete");
      out.deleteKey = { editors: await page.locator(".grid-editor").count(), strike: (await rowTexts(page, "Strike"))[1] };
      await page.keyboard.press("Backspace");
      out.backspaceKey = { editors: await page.locator(".grid-editor").count(), strike: (await rowTexts(page, "Strike"))[1] };
      await page.keyboard.press("Escape");
      // F2 / double click
      await (await cell(page, "Strike", 2)).dblclick();
      out.dblclick = { editors: await page.locator(".grid-editor").count() };
      await page.keyboard.press("Escape");
      await page.keyboard.press("F2");
      out.f2 = { editors: await page.locator(".grid-editor").count() };
      await page.keyboard.press("Escape");
      record("keys", app, out);
    });

    test("rapid typing and rapid repeated commits", async ({ page }) => {
      await (await cell(page, "Strike", 1)).click();
      await page.keyboard.press("Enter");
      await page.locator(".grid-editor").pressSequentially("1234567890abcdefghij", { delay: 0 });
      await page.keyboard.press("Enter");
      const long = (await rowTexts(page, "Strike"))[1];
      for (let i = 1; i <= 25; i++) {
        await (await cell(page, "Strike", 2)).click();
        await page.keyboard.type(String(i % 1000), { delay: 0 });
        await page.keyboard.press("Enter");
      }
      await page.waitForTimeout(150);
      record("rapid-typing", app, { long, final: (await rowTexts(page, "Strike")).join("|"), err: await hasErr(page, "Strike", 1) });
    });

    test("click away while editing commits (blur) and a burst of focus changes", async ({ page }) => {
      const out: Record<string, unknown> = {};
      await (await cell(page, "Strike", 1)).click();
      await page.keyboard.press("Enter");
      await page.locator(".grid-editor").fill("7");
      await (await cell(page, "Strike", 2)).click(); // click another cell
      out.clickAway = { strike: (await rowTexts(page, "Strike")).join("|"), editors: await page.locator(".grid-editor").count() };
      await (await cell(page, "Call / Put", 1)).click();
      await page.keyboard.press("Enter");
      out.selectEditorCount = await page.locator(".grid-editor").count();
      await page.getByRole("button", { name: "Add Average" }).click(); // click a toolbar button with an editor open
      out.afterToolbarClick = { editors: await page.locator(".grid-editor").count(), groups: await page.locator(".grid-group__title").count() };
      // a burst: click 40 random cells, alternating Enter/Escape/typing
      const labels = ["Strike", "Expiry Cut", "Ccy Pair", "Call / Put", "Buy / Sell", "Notional Amount", "Settlement Style", "Premium Ccy"];
      for (let i = 0; i < 40; i++) {
        const label = labels[i % labels.length];
        const col = (i % 3) + 1;
        await (await cell(page, label, col)).click({ delay: 0 });
        if (i % 4 === 0) await page.keyboard.press("Enter");
        if (i % 4 === 1) await page.keyboard.type("x");
        if (i % 4 === 2) await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(200);
      out.afterBurst = { editors: await page.locator(".grid-editor").count(), active: await activeLabel(page) };
      record("focus-burst", app, out);
    });

    test("dropdowns via keyboard", async ({ page }) => {
      const out: Record<string, unknown> = {};
      const options = (sel = page.locator(".grid-editor")) => sel.evaluate((el) => [...(el as HTMLSelectElement).options].map((o) => `${o.textContent}${o.disabled ? "(disabled)" : ""}${o.selected ? "*" : ""}`));
      await (await cell(page, "Settlement Style", 1)).click();
      await page.keyboard.press("Enter");
      out.styleOptions = await options();
      await page.keyboard.press("ArrowUp"); // Cash is above Delivery in the list? depends on order
      await page.keyboard.press("Enter");
      out.afterArrowEnter = { style: (await rowTexts(page, "Settlement Style")).join("|"), active: await activeLabel(page) };
      await page.waitForTimeout(1500);
      // Escape reverts
      await (await cell(page, "Settlement Style", 2)).click();
      await page.keyboard.press("Enter");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Escape");
      out.afterEscape = (await rowTexts(page, "Settlement Style")).join("|");
      // typing a letter picks an option
      await (await cell(page, "Settlement Style", 3)).click();
      await page.keyboard.press("Enter");
      await page.keyboard.type("C");
      await page.keyboard.press("Enter");
      out.afterTypeC = (await rowTexts(page, "Settlement Style")).join("|");
      // the settings dropdowns
      await (await cell(page, "Internal", "settings")).click();
      await page.keyboard.press("Enter");
      out.internalOptions = await options();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      out.afterInternal = { hedge: await (await cell(page, "Hedge Type", "settings")).textContent(), internal: await (await cell(page, "Internal", "settings")).textContent(), active: await activeLabel(page) };
      // the deal column's style dropdown: options and broadcast
      await (await cell(page, "Settlement Style", 0)).click();
      await page.keyboard.press("Enter");
      out.dealStyleOptions = await options();
      await page.keyboard.press("Escape");
      // mouse selection in a native select
      await (await cell(page, "Settlement Style", 1)).click();
      await page.keyboard.press("Enter");
      await page.locator(".grid-editor").selectOption({ label: "Delivery" });
      await page.keyboard.press("Enter");
      out.afterSelectOption = (await rowTexts(page, "Settlement Style")).join("|");
      record("dropdowns", app, out);
    });

    test("editing while a calculation runs: rapid edits end in the right price", async ({ page }) => {
      await editCell(page, "Notional Ccy", 0, "USD");
      await editCell(page, "Notional Amount", 0, "1000");
      // a calculation is probably queued/in flight; edit rapidly
      for (const v of ["2000", "3000", "4000", "5000"]) {
        await editCell(page, "Notional Amount", 1, v);
        await page.waitForTimeout(120);
      }
      const during = await priceOut(page).textContent();
      await expect(priceOut(page)).toHaveText(/^\d+\.\d\d$/, { timeout: 9000 });
      // 3 products * (1 + 5) = 18.00
      record("edit-during-calc", app, { during, final: await priceOut(page).textContent() });
      await expect(priceOut(page)).toHaveText("18.00");
    });
  });
}
