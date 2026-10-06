import { apps, cell, collectConsole, expect, openApp, rowTexts, test } from "./helpers.ts";
import { record } from "./obs.ts";

// an editor open in the LAST group's column, then a real click on that group's remove button
for (const app of apps) {
  test(`removing the last group while its cell is being edited: ${app}`, async ({ page }) => {
    const log = collectConsole(page);
    await openApp(page, app);
    await page.getByRole("button", { name: "Add Strategy" }).click();
    await page.getByRole("button", { name: "Add Average" }).click();
    const headers = await page.locator(".deal-grid .slick-header-column.grid-header--product").count();
    await (await cell(page, "Strike", headers)).click();
    await page.keyboard.press("Enter");
    await page.locator(".grid-editor").fill("EDIT");
    await page.getByRole("button", { name: "Remove", exact: true }).last().click();
    await page.waitForTimeout(300);
    const afterRemove = await page.locator(".grid-group__title").allTextContents();
    await page.screenshot({ path: `tests/battletest/browser/shots/remove-last-while-editing-${app}.png`, clip: { x: 0, y: 0, width: 1500, height: 330 } });
    await page.getByRole("button", { name: "Add Vanilla Group" }).click();
    await page.waitForTimeout(300);
    const afterAdd = await page.locator(".grid-group__title").allTextContents();
    await (await cell(page, "Strike", 1)).click();
    await page.keyboard.press("Enter");
    await page.locator(".grid-editor").fill("fine");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const errors = log.filter((l) => l.type === "error" || l.type === "pageerror").map((l) => l.text.slice(0, 80));
    record("remove-last-while-editing", app, { afterRemove, afterAdd, strike: await rowTexts(page, "Strike"), errors });
    // the expectation: the removed group is gone from the grid at once, no error
    expect.soft(afterRemove).toEqual(["Vanilla Group #1", "Strategy #2"]);
    expect.soft(errors).toEqual([]);
  });
}
