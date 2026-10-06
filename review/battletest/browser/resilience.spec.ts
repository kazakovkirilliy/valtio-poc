import type { Page } from "@playwright/test";
import { activeCell, copy } from "../../e2e/support/fixtures.ts";
import { addDeal, apps, cell, collectConsole, editCell, expect, openApp, paste, rowTexts, test } from "./helpers.ts";
import { record } from "./obs.ts";

const metrics = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector(".deal-grid") as HTMLElement;
    const left = document.querySelector(".deal-grid .slick-pane-left") as HTMLElement | null;
    const right = document.querySelector(".deal-grid .slick-pane-right") as HTMLElement | null;
    const rect = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().width) : null);
    return {
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
      grid: rect(grid),
      leftPane: rect(left),
      rightPane: rect(right),
      rightVisibleW: right ? Math.round(Math.min(right.getBoundingClientRect().right, innerWidth) - Math.max(right.getBoundingClientRect().left, 0)) : null,
      toolbarWraps: (() => {
        const buttons = [...document.querySelectorAll(".deal__toolbar button")] as HTMLElement[];
        return new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size;
      })(),
    };
  });

for (const app of apps) {
  test.describe(`resilience: ${app}`, () => {
    test("narrow viewport (375 x 812)", async ({ page }) => {
      const log = collectConsole(page);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/${app}.html`);
      await page.getByText("Vanilla Group #1").waitFor({ state: "attached" });
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await page.getByRole("button", { name: "Add Average" }).click();
      const m = await metrics(page);
      test.setTimeout(40_000);
      // can the user still reach a product's Strike cell and edit it?
      const strike = await cell(page, "Strike", 2);
      await strike.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
      const box = await strike.boundingBox({ timeout: 2000 }).catch(() => null);
      const visible = box ? box.x >= 0 && box.x + box.width <= 375 : false;
      let editable = false;
      try {
        await strike.click({ timeout: 3000 });
        await page.keyboard.press("Enter");
        await page.locator(".grid-editor").fill("5", { timeout: 2000 });
        await page.keyboard.press("Enter");
        editable = (await rowTexts(page, "Strike"))[2] === "5";
      } catch { /* cannot reach */ }
      if (app === "valtio" || app === "zustand") await page.screenshot({ path: `tests/battletest/browser/shots/narrow-${app}.png`, fullPage: true });
      record("narrow-viewport", app, { m, strikeVisibleAfterScroll: visible, editable, errors: log.filter((l) => l.type === "error" || l.type === "pageerror").length });
    });

    test("keyboard only: Tab into the grid, arrows, Enter/type/Enter, copy, paste, group buttons", async ({ page }) => {
      await openApp(page, app);
      // from the top of the page, how many Tabs to reach the first grid cell, and in what order do controls come?
      await page.mouse.click(5, 5);
      const order: string[] = [];
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press("Tab");
        const d = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return "none";
          const aria = el.getAttribute("aria-label");
          return `${el.tagName.toLowerCase()}${el.classList.contains("slick-cell") ? ".slick-cell" : ""}:${(aria ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 28)}`;
        });
        order.push(d);
      }
      // can the grid be entered with the keyboard only? (is a cell active?)
      const cellActive = (await page.locator(".deal-grid .slick-cell.active").count()) > 0;
      // use mouse to focus the first cell, then keyboard only
      await (await cell(page, "Notional Amount", 1)).click();
      await page.keyboard.press("Enter");
      await page.keyboard.type("333");
      await page.keyboard.press("Enter");
      const afterEdit = (await rowTexts(page, "Notional Amount")).join("|");
      await page.keyboard.press("Shift+ArrowDown");
      await page.keyboard.press("Shift+ArrowDown");
      const copied = await copy(page);
      // group buttons are reachable by keyboard?
      const groupBtn = page.locator(".grid-group__action").first();
      await groupBtn.focus();
      await page.keyboard.press("Enter");
      const cloned = await page.locator(".grid-group__title").count();
      record("keyboard", app, { order, cellActive, afterEdit, copied, cloned });
    });

    test("a burst of focus changes between tabs, switches and the grid, no errors", async ({ page }) => {
      const log = collectConsole(page);
      await openApp(page, app);
      await addDeal(page).click();
      await addDeal(page).click();
      for (let i = 0; i < 30; i++) {
        await page.getByRole("button", { name: `Tab ${(i % 3) + 1}`, exact: true }).click({ delay: 0 });
        if (i % 3 === 0) await page.getByRole("switch", { name: "Autocalc" }).click({ delay: 0 });
        if (i % 4 === 0) await page.getByRole("button", { name: /Toggle Spot/ }).click({ delay: 0 });
        if (i % 5 === 0) await page.getByRole("button", { name: "Add Strategy" }).click({ delay: 0 });
        await (await cell(page, "Strike", 1)).click({ delay: 0 });
        await page.keyboard.press("Enter");
        await page.keyboard.type(String(i));
        if (i % 2) await page.keyboard.press("Escape"); // else leave the editor open and switch tab
      }
      await page.waitForTimeout(500);
      const groups = [] as number[];
      for (let t = 1; t <= 3; t++) {
        await page.getByRole("button", { name: `Tab ${t}`, exact: true }).click();
        await page.waitForTimeout(150);
        groups.push(await page.locator(".grid-group__title").count());
      }
      record("tab-burst", app, { groups, errors: log.filter((l) => l.type === "error" || l.type === "pageerror").map((l) => l.text.slice(0, 120)) });
    });

    test("an open editor and a tab switch: the draft", async ({ page }) => {
      await openApp(page, app);
      await (await cell(page, "Strike", 1)).click();
      await page.keyboard.press("Enter");
      await page.locator(".grid-editor").fill("draft");
      await addDeal(page).click(); // tab switch with an editor open (the grid unmounts)
      await page.getByRole("button", { name: "Tab 1", exact: true }).click();
      await page.waitForTimeout(200);
      record("tab-switch-open-editor", app, { strike: (await rowTexts(page, "Strike")).join("|"), editors: await page.locator(".grid-editor").count() });
    });
  });
}
