import type { Page } from "@playwright/test";
import { apps, autocalcSwitch, calcButton, cell, editCell, expect, openApp, priceOut, settled, test } from "./helpers.ts";
import { record } from "./obs.ts";

const FIXING = "https://jsonplaceholder.typicode.com/users?*";
const mock = (page: Page) => page.route(FIXING, (route) => route.fulfill({ json: [{ id: 4, name: "Cash D" }] }));
const errs = async (page: Page, label: string, cols: number[]) =>
  Promise.all(cols.map(async (c) => /grid-cell--error/.test((await (await cell(page, label, c)).getAttribute("class")) ?? "")));

for (const app of apps) {
  test(`validation lifecycle: ${app}`, async ({ page }) => {
    await mock(page);
    await openApp(page, app);
    await page.getByRole("button", { name: "Add Strategy" }).click();
    await settled(page);
    await editCell(page, "Notional Ccy", 0, "USD");
    await expect(priceOut(page)).toHaveText("3.00", { timeout: 12000 });
    const out: Record<string, unknown> = {};
    // an error in the strategy's second product: not ready, price outdated
    await editCell(page, "Strike", 3, "TOOLONG");
    await page.waitForTimeout(300);
    out.afterError = { price: await priceOut(page).textContent(), calcDisabled: await calcButton(page).isDisabled(), err: await errs(page, "Strike", [1, 2, 3]) };
    // clone the strategy: the clone carries the error too
    await page.getByRole("button", { name: "Clone", exact: true }).nth(1).click();
    await page.waitForTimeout(300);
    out.afterClone = { err: await errs(page, "Strike", [1, 2, 3, 4, 5]), calcDisabled: await calcButton(page).isDisabled() };
    // fix the original: the clone's error remains
    await editCell(page, "Strike", 3, "1");
    out.afterFixOriginal = { err: await errs(page, "Strike", [1, 2, 3, 4, 5]), calcDisabled: await calcButton(page).isDisabled() };
    // remove the clone: the deal is valid again, autocalc recalculates
    await page.getByRole("button", { name: "Remove", exact: true }).nth(2).click();
    await page.waitForTimeout(300);
    out.afterRemoveClone = { calcDisabled: await calcButton(page).isDisabled(), err: await errs(page, "Strike", [1, 2, 3]) };
    await expect(priceOut(page)).toHaveText("3.00", { timeout: 12000 });
    // error, then remove the errored group itself
    await editCell(page, "Strike", 2, "TOOLONG");
    await page.waitForTimeout(200);
    const notReady = await calcButton(page).isDisabled();
    await page.getByRole("button", { name: "Remove", exact: true }).nth(1).click();
    await page.waitForTimeout(300);
    out.afterRemoveErrored = { notReadyBefore: notReady, calcDisabled: await calcButton(page).isDisabled(), hint: await page.locator(".deal__calc-hint").count() };
    await expect(priceOut(page)).toHaveText("1.00", { timeout: 12000 });
    // an errored deal with autocalc off: Calculate stays disabled; remove error -> enabled
    await autocalcSwitch(page).click();
    await editCell(page, "Strike", 1, "TOOLONG");
    out.errorAutocalcOff = { calcDisabled: await calcButton(page).isDisabled() };
    await page.getByRole("button", { name: "Remove", exact: true }).first().click();
    await page.waitForTimeout(300);
    out.removedAllErrored = { calcDisabled: await calcButton(page).isDisabled(), price: await priceOut(page).textContent() };
    record("validation-lifecycle", app, out);
  });
}
