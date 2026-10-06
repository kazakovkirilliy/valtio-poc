import { apps, cell, collectConsole, editCell, expect, openApp, rowTexts, test } from "./helpers.ts";
import { record } from "./obs.ts";

// structural changes while an editor is open: no exceptions, no stranded editor, no lost/misplaced commits
for (const app of apps) {
  test(`editor open while the columns change: ${app}`, async ({ page }) => {
    const log = collectConsole(page);
    await openApp(page, app);
    await page.getByRole("button", { name: "Add Strategy" }).click();
    await page.getByRole("button", { name: "Add Average" }).click();
    await expect(page.getByText("Average #3")).toBeVisible();
    const out: Record<string, unknown> = {};
    const state = async () => ({ editors: await page.locator(".grid-editor").count(), strike: (await rowTexts(page, "Strike")).join("|"), groups: await page.locator(".grid-group__title").allTextContents() });

    // 1. an editor open in the strategy's product; remove that strategy with a real click
    await (await cell(page, "Strike", 2)).click();
    await page.keyboard.press("Enter");
    await page.locator(".grid-editor").fill("EDIT1");
    await page.getByRole("button", { name: "Remove", exact: true }).nth(1).click();
    out.removeWhileEditing = await state();

    // 2. an editor open, then a programmatic Add (no blur): setColumns under an open editor
    await (await cell(page, "Strike", 1)).click();
    await page.keyboard.press("Enter");
    await page.locator(".grid-editor").fill("EDIT2");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add Strategy")!.click());
    await page.waitForTimeout(150);
    out.addWhileEditing = await state();
    await page.keyboard.press("Enter"); // commit whatever the editor still holds
    await page.waitForTimeout(150);
    out.afterEnter = await state();

    // 3. an editor open on a product, that product's group is cloned (programmatic: no blur)
    await (await cell(page, "Strike", 1)).click();
    await page.keyboard.press("Enter");
    await page.locator(".grid-editor").fill("EDIT3");
    await page.evaluate(() => (document.querySelector('.grid-group__action[aria-label="Clone"]') as HTMLElement).click());
    await page.waitForTimeout(150);
    out.cloneWhileEditing = await state();
    await page.keyboard.press("Escape");

    // 4. an editor open in the LAST column, which is then removed programmatically (the editor's column vanishes)
    const lastIndex = (await page.locator(".grid-group__action[aria-label='Remove']").count()) - 1;
    const headers = await page.locator(".deal-grid .slick-header-column.grid-header--product").count();
    await (await cell(page, "Strike", headers)).click();
    await page.keyboard.press("Enter");
    await page.locator(".grid-editor").fill("EDIT4");
    await page.evaluate((i) => (document.querySelectorAll('.grid-group__action[aria-label="Remove"]')[i] as HTMLElement).click(), lastIndex);
    await page.waitForTimeout(150);
    out.removeLastWhileEditing = await state();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    out.afterEnterAfterRemoveLast = await state();

    // 5. paste while the editor is open pastes into the editor, not the grid
    await (await cell(page, "Strike", 1)).click();
    await page.keyboard.press("Enter");
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", "P1\tP2\nP3\tP4");
      document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    out.pasteWhileEditing = await state();
    await page.keyboard.press("Escape");
    await editCell(page, "Strike", 1, "ok");
    out.stillWorks = (await rowTexts(page, "Strike"))[1];
    out.errors = log.filter((l) => l.type === "error" || l.type === "pageerror").map((l) => l.text.slice(0, 140));
    record("editor-lifecycle", app, out);
  });
}
