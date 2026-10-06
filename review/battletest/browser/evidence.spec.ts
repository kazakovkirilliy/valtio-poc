import { addDeal, apps, openApp, tab, test } from "./helpers.ts";

// screenshots of the bugs, one per app for the cross-app ones (lead 1)
for (const app of apps) {
  test(`evidence lead1: ${app}`, async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 600 });
    await openApp(page, app);
    await addDeal(page).click();
    for (let i = 0; i < 3; i++) {
      await tab(page, 1).click();
      await tab(page, 2).click();
    }
    await tab(page, 1).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `tests/battletest/browser/shots/lead1-tab-switch-adds-groups-${app}.png`, clip: { x: 0, y: 0, width: 1500, height: 260 } });
  });
}
test("evidence lead1c: remove all groups then switch tabs brings one back (valtio)", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 600 });
  await openApp(page, "valtio");
  await page.getByRole("button", { name: "Remove", exact: true }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "tests/battletest/browser/shots/lead1c-before-switch-valtio.png", clip: { x: 0, y: 0, width: 1500, height: 260 } });
  await addDeal(page).click();
  await tab(page, 1).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "tests/battletest/browser/shots/lead1c-after-switch-valtio.png", clip: { x: 0, y: 0, width: 1500, height: 260 } });
});
