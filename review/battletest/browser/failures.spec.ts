import type { Page, Route } from "@playwright/test";
import { addDeal, apps, autocalcSwitch, calcButton, cell, collectConsole, editCell, expect, openApp, paste, priceOut, rowTexts, settled, tab, test } from "./helpers.ts";
import { record } from "./obs.ts";

const URL_GLOB = "https://jsonplaceholder.typicode.com/users?*";
const CASH = [{ id: 4, name: "Cash D" }, { id: 3, name: "Shared C" }];

/** Samples `read` every `step` ms for `ms`, returning the distinct consecutive values. */
const timeline = async (page: Page, read: () => Promise<string>, ms: number, step = 80) => {
  const seen: string[] = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await read();
    if (seen.at(-1) !== v) seen.push(v);
    await page.waitForTimeout(step);
  }
  return seen;
};
const fixingText = (page: Page, col: number) => async () => (await (await cell(page, "Fixing Source", col)).textContent()) ?? "";
const fixingClass = (page: Page, col: number) => async () => (await (await cell(page, "Fixing Source", col)).getAttribute("class")) ?? "";

for (const app of apps) {
  test.describe(`failures: ${app}`, () => {
    test("every kind of failure says Failed to load and the app keeps working", async ({ page }) => {
      const log = collectConsole(page);
      const out: Record<string, unknown> = {};
      const modes: Record<string, (route: Route) => Promise<void>> = {
        abort: (route) => route.abort(),
        http500: (route) => route.fulfill({ status: 500, body: "boom" }),
        http404: (route) => route.fulfill({ status: 404, json: [] }),
        badJson: (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{not json" }),
        notArray: (route) => route.fulfill({ json: { users: [] } }),
        wrongItems: (route) => route.fulfill({ json: [{ id: "x", name: 5 }] }),
        emptyList: (route) => route.fulfill({ json: [] }),
        duplicates: (route) => route.fulfill({ json: [{ id: 1, name: "Dup" }, { id: 1, name: "Dup" }] }),
        oneItem: (route) => route.fulfill({ json: [{ id: 9, name: "Only" }] }),
      };
      for (const [mode, handler] of Object.entries(modes)) {
        const errsBefore = log.length;
        const p = await page.context().newPage();
        const plog = collectConsole(p);
        await p.route(URL_GLOB, handler);
        await openApp(p, app);
        await p.waitForTimeout(1600); // fake latency 1s + the request
        const dealCell = await (await cell(p, "Fixing Source", 0)).textContent();
        await editCell(p, "Settlement Style", 1, "Cash");
        await p.waitForTimeout(1600);
        const prod = await (await cell(p, "Fixing Source", 1)).textContent();
        const prodClass = /grid-cell--pending/.test((await (await cell(p, "Fixing Source", 1)).getAttribute("class")) ?? "") ? "pending" : "ok";
        const err = /grid-cell--error/.test((await (await cell(p, "Fixing Source", 1)).getAttribute("class")) ?? "");
        // the rest of the app: edit, autocalc
        await editCell(p, "Notional Ccy", 0, "USD");
        await p.waitForTimeout(3600);
        const price = await priceOut(p).textContent();
        const calcDisabled = await calcButton(p).isDisabled();
        // can the user open the Fixing Source editor?
        await (await cell(p, "Fixing Source", 1)).click();
        await p.keyboard.press("Enter");
        const editorOptions = await p.locator(".grid-editor").evaluate((el) => [...(el as HTMLSelectElement).options].map((o) => o.textContent)).catch(() => null);
        await p.keyboard.press("Escape");
        out[mode] = { dealCell, prod, prodClass, err, price, calcDisabled, editorOptions, consoleErrors: plog.filter((l) => l.type === "error" || l.type === "pageerror").map((l) => l.text.slice(0, 90)) };
        await p.close();
        void errsBefore;
      }
      record("failure-modes", app, out);
    });

    test("recovery: after a failure, does a later Cash switch retry?", async ({ page }) => {
      let failing = true;
      let requests = 0;
      await page.route(URL_GLOB, async (route) => {
        requests++;
        if (failing) await route.abort();
        else await route.fulfill({ json: CASH });
      });
      await openApp(page, app);
      await page.waitForTimeout(1800);
      const out: Record<string, unknown> = { initialDeal: await fixingText(page, 0)(), requestsAfterLoad: requests };
      failing = false;
      await editCell(page, "Settlement Style", 1, "Cash"); // a new request now
      await page.waitForTimeout(1800);
      out.afterCash = { prod: await fixingText(page, 1)(), deal: await fixingText(page, 0)(), requests };
      await editCell(page, "Settlement Style", 1, "Delivery");
      await editCell(page, "Settlement Style", 1, "Cash");
      await page.waitForTimeout(1800);
      out.afterCashAgain = { prod: await fixingText(page, 1)(), deal: await fixingText(page, 0)(), requests };
      // a new deal starts loading again
      await addDeal(page).click();
      await page.waitForTimeout(1800);
      out.newDeal = { deal: await fixingText(page, 0)(), requests };
      record("failure-recovery", app, out);
    });

    test("slow response: leaving Cash (and coming back) before it arrives", async ({ page }) => {
      let requests = 0;
      await page.route(URL_GLOB, async (route) => {
        requests++;
        await new Promise((r) => setTimeout(r, 3500));
        await route.fulfill({ json: CASH });
      });
      await openApp(page, app);
      await page.waitForTimeout(500);
      const out: Record<string, unknown> = {};
      // wait until the deal's first (slow) request is done so Cash options are cached
      await expect(await cell(page, "Fixing Source", 0)).toHaveText("", { timeout: 9000 });
      out.requestsAfterDeal = requests;
      await page.reload();
      await page.getByText("Vanilla Group #1").waitFor();
      await page.waitForTimeout(200);
      // the deal's request is in flight (cache is per page load): switch to Cash and back quickly
      await editCell(page, "Settlement Style", 1, "Cash");
      const afterCash = await fixingText(page, 1)();
      await editCell(page, "Settlement Style", 1, "Delivery");
      const t = await timeline(page, async () => `${(await (await cell(page, "Settlement Style", 1)).textContent()) ?? ""}/${(await fixingText(page, 1)()).trim() || "∅"}/${/grid-cell--none/.test(await fixingClass(page, 1)()) ? "none" : "has"}`, 5500, 200);
      out.afterCash = afterCash;
      out.timelineAfterLeaving = t;
      out.requests = requests;
      record("slow-leave-cash", app, out);
    });

    test("editing during an options load: Cash then immediately edit / paste Fixing Source", async ({ page }) => {
      const log = collectConsole(page);
      await page.route(URL_GLOB, async (route) => {
        await new Promise((r) => setTimeout(r, 2200));
        await route.fulfill({ json: CASH });
      });
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await expect(page.getByText("Strategy #2")).toBeVisible();
      // wait for the cache to be warm for the deal, then reload so loads are in flight again? we want a COLD cache with a slow server:
      // so act at once: the deal's own load is also in flight; Cash on a product shares it
      const out: Record<string, unknown> = {};
      await editCell(page, "Settlement Style", 1, "Cash");
      out.t0Cell = await fixingText(page, 1)();
      // (a) edit the Fixing Source via the editor while loading
      await (await cell(page, "Fixing Source", 1)).click();
      await page.keyboard.press("Enter");
      const editor = page.locator(".grid-editor");
      out.editorWhileLoading = await editor.count() ? await editor.evaluate((el) => (el as HTMLSelectElement).options ? [...(el as HTMLSelectElement).options].map((o) => o.textContent) : null) : "no editor";
      await page.keyboard.press("Enter"); // commit (the placeholder: nothing chosen)
      out.afterCommitCell = await fixingText(page, 1)();
      // (b) paste a fixing source label while loading
      await (await cell(page, "Fixing Source", 1)).click();
      await paste(page, "Shared C");
      out.afterPasteWhileLoading = { cell: await fixingText(page, 1)(), status: await page.locator(".deal-grid__status").textContent() };
      // (c) paste a block: a style for product 2 + its fixing source in one go (O6) while loading
      await (await cell(page, "Settlement Style", 2)).click();
      await paste(page, "Cash\n\nShared C");
      out.afterBlock = { cell2: await fixingText(page, 2)(), status: await page.locator(".deal-grid__status").textContent() };
      // (d) broadcast style on the deal while loading, with an editor open on a product
      await (await cell(page, "Strike", 3)).click();
      await page.keyboard.press("Enter");
      await page.locator(".grid-editor").fill("typing");
      await page.waitForTimeout(2600); // the options arrive while the editor is open
      out.editorSurvivesLoad = { editors: await page.locator(".grid-editor").count(), value: await page.locator(".grid-editor").inputValue().catch(() => null) };
      await page.keyboard.press("Enter");
      await settled(page);
      await page.waitForTimeout(300);
      out.final = { fixing: await rowTexts(page, "Fixing Source"), style: await rowTexts(page, "Settlement Style"), strike: (await rowTexts(page, "Strike"))[3] };
      out.errors = log.filter((l) => l.type === "error" || l.type === "pageerror").map((l) => l.text.slice(0, 100));
      record("edit-during-options-load", app, out);
    });

    test("an options response arriving after the group was removed / the tab was left", async ({ page }) => {
      const log = collectConsole(page);
      await page.route(URL_GLOB, async (route) => {
        await new Promise((r) => setTimeout(r, 2500));
        await route.fulfill({ json: CASH });
      });
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await editCell(page, "Settlement Style", 1, "Cash");
      await editCell(page, "Settlement Style", 2, "Cash");
      await page.getByRole("button", { name: "Remove", exact: true }).nth(1).click(); // remove the strategy while its options load
      await addDeal(page).click(); // leave tab 1 while loading
      await page.waitForTimeout(3500);
      await tab(page, 1).click();
      await page.waitForTimeout(500);
      const out = { groups: await page.locator(".grid-group__title").allTextContents(), fixing: await rowTexts(page, "Fixing Source"), style: await rowTexts(page, "Settlement Style"), errors: log.filter((l) => l.type === "error" || l.type === "pageerror").map((l) => l.text.slice(0, 120)) };
      record("late-response-removed", app, out);
    });
  });
}
