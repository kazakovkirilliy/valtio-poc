import { addDeal, apps, autocalcSwitch, cell, collectConsole, editCell, expect, openApp, paste, priceOut, settled, spotToggle, tab, test } from "./helpers.ts";
import { record } from "./obs.ts";

// one long tour of the app; every console message (any level) is kept, deduplicated, per app
for (const app of apps) {
  test(`console tour: ${app}`, async ({ page }) => {
    const log = collectConsole(page);
    page.on("requestfailed", (r) => log.push({ type: "requestfailed", text: `${r.url().slice(0, 60)} ${r.failure()?.errorText}` }));
    await openApp(page, app);
    await page.getByRole("button", { name: "Add Strategy" }).click();
    await page.getByRole("button", { name: "Add Average" }).click();
    await page.getByRole("button", { name: "Add Vanilla Group" }).click();
    await page.getByRole("button", { name: "Clone", exact: true }).nth(1).click();
    await editCell(page, "Notional Ccy", 0, "USD");
    await editCell(page, "Notional Amount", 3, "250");
    await editCell(page, "Settlement Style", 0, "Cash");
    await settled(page);
    await editCell(page, "Settlement Style", 2, "Delivery");
    await editCell(page, "Expiry Days", 1, "4");
    await editCell(page, "Hedge Type", "settings", "b");
    await editCell(page, "Internal", "settings", "No");
    await (await cell(page, "Strike", 1)).click();
    await paste(page, "1\t2\t3\nCall\tPut\tCall\nBuy\tSell\tBuy");
    await expect(priceOut(page)).toHaveText(/\d/, { timeout: 12000 });
    await page.getByRole("button", { name: "Remove", exact: true }).nth(2).click();
    await addDeal(page).click();
    await editCell(page, "Strike", 1, "9");
    await tab(page, 1).click();
    await tab(page, 2).click();
    await autocalcSwitch(page).click();
    await spotToggle(page).click();
    await spotToggle(page).click();
    await autocalcSwitch(page).click();
    await page.waitForTimeout(2500);
    await page.reload();
    await page.getByText("Vanilla Group #1").waitFor();
    await page.waitForTimeout(500);
    const interesting = log.filter((l) => !(l.type === "log" || l.type === "debug"));
    const dedup = [...new Set(interesting.map((l) => `${l.type}: ${l.text.replace(/\s+/g, " ").slice(0, 220)}`))];
    record("console-tour", app, dedup);
    console.log(`CONSOLE-LOG-LINES ${app} ${log.filter((l) => l.type === "log" || l.type === "debug").length}`);
  });
}
