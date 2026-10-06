import type { Page } from "@playwright/test";
import { apps, cell, dump, editCell, expect, openApp, pasteStatus, rowTexts, settled, test } from "./helpers.ts";
import { activeCell, copy, paste } from "../../e2e/support/fixtures.ts";
import { record } from "./obs.ts";

const FIXING = "https://jsonplaceholder.typicode.com/users?*";
const mockFixing = (page: Page, ms = 150) =>
  page.route(FIXING, async (route) => {
    const style = new URL(route.request().url()).searchParams.get("settlementStyle") ?? "";
    await new Promise((r) => setTimeout(r, ms));
    await route.fulfill({ json: style === "Cash" ? [{ id: 4, name: "Cash D" }, { id: 3, name: "Shared C" }] : [{ id: 1, name: "Delivery A" }] });
  });
const tsv = (rows: string[][]) =>
  rows.map((r) => r.map((c) => (/[\t\n\r"]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c)).join("\t")).join("\n");
const select = async (page: Page, label: string, from: number, toLabel: string, to: number) => {
  await (await cell(page, label, from)).click();
  await (await cell(page, toLabel, to)).click({ modifiers: ["Shift"] });
};

for (const app of apps) {
  test.describe(`clipboard: ${app}`, () => {
    test("copy/paste round trip of special characters", async ({ page }) => {
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await expect(page.getByText("Strategy #2")).toBeVisible();
      const samples = ["a\tb", "line1\nline2", 'say "hi"', "日本語🎉é", "العربية", "e\u0301 combining", "  padded  ", '"', '""', "trailing\\", "a\r\nb", "<b>x</b>", "", "x", "-"];
      const rows: string[][] = [];
      for (let i = 0; i < samples.length; i += 3) rows.push(samples.slice(i, i + 3));
      // rows land on Strike, Call / Put, Buy / Sell, Ccy Pair, Expiry Cut (text rows), products 1..3
      await (await cell(page, "Strike", 1)).click();
      await paste(page, tsv(rows));
      const shown: Record<string, string[]> = {};
      for (const label of ["Strike", "Call / Put", "Buy / Sell", "Ccy Pair", "Expiry Cut"]) shown[label] = (await rowTexts(page, label)).slice(1);
      // select the 5 x 3 block with the keyboard and copy it
      await (await cell(page, "Strike", 1)).click();
      for (let i = 0; i < 2; i++) await page.keyboard.press("Shift+ArrowRight");
      for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowDown");
      const copied = await copy(page);
      // what a spreadsheet would put on the clipboard for the same block: CRLF newlines inside a cell become LF here
      const expected = tsv(rows.map((r) => r.map((c) => c.replace(/\r\n/g, "\n"))));
      // paste the copy back over the same block: nothing may change
      await (await cell(page, "Strike", 1)).click();
      await paste(page, copied);
      const shownAgain: Record<string, string[]> = {};
      for (const label of ["Strike", "Call / Put", "Buy / Sell", "Ccy Pair", "Expiry Cut"]) shownAgain[label] = (await rowTexts(page, label)).slice(1);
      record("special-chars", app, { shown, copied, copiedEqualsExpected: copied === expected, roundTripStable: JSON.stringify(shown) === JSON.stringify(shownAgain) });
    });

    test("very long cell text", async ({ page }) => {
      await openApp(page, app);
      const long = "x".repeat(200_000);
      await (await cell(page, "Expiry Cut", 1)).click();
      const t0 = Date.now();
      await paste(page, long);
      const pasteMs = Date.now() - t0;
      const len = ((await rowTexts(page, "Expiry Cut"))[1] ?? "").length;
      await (await cell(page, "Expiry Cut", 1)).click();
      const copied = await copy(page);
      record("very-long", app, { len, copiedLen: copied.length, errClass: /grid-cell--error/.test((await (await cell(page, "Expiry Cut", 1)).getAttribute("class")) ?? "") });
      console.log(`PERF very-long ${app} pasteMs=${pasteMs}`);
    });

    test("markup in cells is shown as text, never executed", async ({ page }) => {
      await openApp(page, app);
      await page.evaluate(() => { (window as unknown as { __xss: number }).__xss = 0; });
      await (await cell(page, "Strike", 1)).click();
      await paste(page, '<img src=x onerror="window.__xss=1">\n"><svg onload=window.__xss=2>\n&amp;&lt;');
      await page.waitForTimeout(300);
      const xss = await page.evaluate(() => (window as unknown as { __xss: number }).__xss);
      const html = await (await cell(page, "Strike", 1)).innerHTML();
      const rowsText = [await (await cell(page, "Strike", 1)).textContent(), await (await cell(page, "Call / Put", 1)).textContent(), await (await cell(page, "Buy / Sell", 1)).textContent()];
      record("markup", app, { xss, rowsText, injectedElements: await page.locator(".deal-grid img, .deal-grid svg").count() });
      expect(xss).toBe(0);
      void html;
    });

    test("big blocks: 16 x 30 into the deal column and into products", async ({ page }) => {
      await mockFixing(page);
      await openApp(page, app);
      for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Add Strategy" }).click();
      await expect(page.locator(".deal-grid .slick-header-column.grid-header--product")).toHaveCount(7);
      await settled(page);
      const gen = (j: number): string[] => [
        `AAA${j}`, String((j + 1) * 100), `P${j}`, `2999-01-${String(j + 1).padStart(2, "0")}`, String(j), "2999-02-01", j % 2 ? "Cash" : "Delivery", `S${j}`,
        j % 3 === 0 ? "Shared C" : "Bogus", String(j), j % 2 ? "Call" : "Put", j % 2 ? "Buy" : "Sell", j % 2 ? "EURUSD" : "gbpusd", `C${j}`, "2999-03-01", "5",
      ];
      const block = Array.from({ length: 16 }, (_, r) => Array.from({ length: 30 }, (_, j) => gen(j)[r]));
      // into the deal column from the top
      await (await cell(page, "Notional Ccy", 0)).click();
      const t0 = Date.now();
      await paste(page, tsv(block));
      await expect(pasteStatus(page)).toContainText("Pasted");
      const status = await pasteStatus(page).textContent();
      await page.waitForTimeout(600);
      await settled(page);
      const ms = Date.now() - t0;
      const afterDeal = await dump(page);
      // then into the products only, from p1 (a different block)
      const block2 = block.map((row) => row.map((v, j) => (j % 2 ? v : `${v}`)).reverse());
      await (await cell(page, "Notional Ccy", 1)).click();
      await paste(page, tsv(block2));
      await expect(pasteStatus(page)).not.toHaveText(status ?? "");
      const status2 = await pasteStatus(page).textContent();
      await page.waitForTimeout(600);
      await settled(page);
      const afterProducts = await dump(page);
      const strip = (d: Record<string, string[]>) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== "Spot Stream"));
      record("big-paste", app, { status, afterDeal: strip(afterDeal), status2, afterProducts: strip(afterProducts) });
      console.log(`PERF big-paste ${app} ms=${ms}`);
    });

    test("paste over the settings subgrid", async ({ page }) => {
      await mockFixing(page);
      await openApp(page, app);
      const hedge = await cell(page, "Hedge Type", "settings");
      const out: Record<string, unknown> = {};
      const state = async () => ({ hedge: await hedge.textContent(), internal: await (await cell(page, "Internal", "settings")).textContent(), status: await pasteStatus(page).textContent() });
      await hedge.click();
      await paste(page, "c\nNo");
      out.cThenNo = await state(); // c is valid while Yes; then No -> d
      await hedge.click();
      await paste(page, "f\nYes");
      out.fThenYes = await state(); // f invalid while No? no: Internal is No now so f valid, then Yes -> a
      await hedge.click();
      await paste(page, "f");
      out.fWhileYes = await state(); // not offered: skipped
      await hedge.click();
      await paste(page, "b\tX\tY\nNo\tZ\nbogus\tW");
      out.wide = { ...(await state()), dealCcy: (await rowTexts(page, "Notional Ccy"))[0], dealAmount: (await rowTexts(page, "Notional Amount"))[0] };
      await (await cell(page, "Internal", "settings")).click();
      await paste(page, "Yes\n7\n8\n9"); // runs past the subgrid: skipped rows
      out.pastDown = await state();
      // one value over a selection spanning the subgrid
      await hedge.click();
      await page.keyboard.press("Shift+ArrowDown");
      await paste(page, "No");
      out.fillNo = await state();
      // select settings + deal and fill
      await select(page, "Hedge Type", "settings" as never, "Premium Ccy", 0);
      await paste(page, "z");
      out.fillAcross = { ...(await state()), dealCcy: (await rowTexts(page, "Notional Ccy"))[0], premium: (await rowTexts(page, "Premium Ccy"))[0] };
      record("settings-paste", app, out);
    });

    test("paste invalid values", async ({ page }) => {
      await mockFixing(page);
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await settled(page);
      const out: Record<string, unknown> = {};
      const tryPaste = async (name: string, label: string, col: number, text: string) => {
        await (await cell(page, label, col)).click();
        await paste(page, text);
        await page.waitForTimeout(60);
        const c = await cell(page, label, col);
        out[name] = { shown: await c.textContent(), err: /grid-cell--error/.test((await c.getAttribute("class")) ?? ""), status: await pasteStatus(page).textContent(), days: (await rowTexts(page, "Expiry Days"))[col], date: (await rowTexts(page, "Expiry Date"))[col] };
      };
      await tryPaste("amount letters", "Notional Amount", 1, "abc");
      await tryPaste("amount 1,5", "Notional Amount", 1, "1,5");
      await tryPaste("amount 1,000.5", "Notional Amount", 1, "1,000.5");
      await tryPaste("amount spaces", "Notional Amount", 1, "  42  ");
      await tryPaste("amount NaN", "Notional Amount", 1, "NaN");
      await tryPaste("amount Infinity", "Notional Amount", 1, "Infinity");
      await tryPaste("amount 0x1f", "Notional Amount", 1, "0x1f");
      await tryPaste("amount negative", "Notional Amount", 1, "-7");
      await tryPaste("amount empty", "Notional Amount", 1, "\n");
      await tryPaste("date 2999-02-30", "Expiry Date", 1, "2999-02-30");
      await tryPaste("date 2999-13-45", "Expiry Date", 1, "2999-13-45");
      await tryPaste("date 2999-1-1", "Expiry Date", 1, "2999-1-1");
      await tryPaste("date 12/31/2999", "Expiry Date", 1, "12/31/2999");
      await tryPaste("date 0000-00-00", "Expiry Date", 1, "0000-00-00");
      await tryPaste("date padded", "Expiry Date", 1, " 2999-05-05 ");
      await tryPaste("delivery before expiry", "Delivery Date", 1, "1999-01-01");
      await tryPaste("days letters", "Expiry Days", 1, "abc");
      await tryPaste("days negative", "Expiry Days", 1, "-2");
      await tryPaste("days 1e3", "Expiry Days", 1, "1e3");
      await tryPaste("style bogus", "Settlement Style", 1, "Bogus");
      await tryPaste("style lowercase", "Settlement Style", 1, "cash");
      await tryPaste("style empty", "Settlement Style", 1, "\n");
      await tryPaste("callput bogus", "Call / Put", 1, "Maybe");
      await tryPaste("ccypair lower", "Ccy Pair", 1, "eurusd");
      await tryPaste("ccypair eurusd on deal", "Ccy Pair", 0, "EURUSD");
      await tryPaste("ccypair gbpusd on product", "Ccy Pair", 2, "GBPUSD");
      await tryPaste("spot (read-only)", "Spot Stream", 0, "99");
      await tryPaste("expiry days on deal", "Expiry Days", 0, "3");
      await tryPaste("fixing source on delivery", "Fixing Source", 1, "Cash D");
      // a number into a text cell, text with trailing newline
      await tryPaste("text trailing newline", "Strike", 1, "ab\n");
      await tryPaste("text whitespace only", "Strike", 1, "   ");
      record("paste-invalid", app, out);
    });

    test("fill a selection with one value across mixed cells", async ({ page }) => {
      await mockFixing(page);
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await settled(page);
      await select(page, "Settlement Style", 0, "Fixing Source", 3);
      await paste(page, "Cash");
      await page.waitForTimeout(500);
      await settled(page);
      const a = { status: await pasteStatus(page).textContent(), style: await rowTexts(page, "Settlement Style"), fixing: await rowTexts(page, "Fixing Source"), ccy: await rowTexts(page, "Settlement Ccy") };
      await select(page, "Settlement Style", 1, "Expiry Days", 3);
      await paste(page, "Delivery");
      const b = { status: await pasteStatus(page).textContent(), style: await rowTexts(page, "Settlement Style"), fixing: await rowTexts(page, "Fixing Source") };
      record("fill-mixed", app, { a, b });
    });
  });
}
