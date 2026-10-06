import { apps, cell, editCell, expect, openApp, paste, rowTexts, settled, test, addDeal } from "./helpers.ts";
import { record } from "./obs.ts";

const URL_GLOB = "https://jsonplaceholder.typicode.com/users?*";
const CASH = [{ id: 4, name: "Cash D" }, { id: 3, name: "Shared C" }];

for (const app of apps) {
  test.describe(`requests: ${app}`, () => {
    test("how many requests, and when, for typical flows (O3: a broadcast makes one request)", async ({ page }) => {
      const hits: { at: number; style: string }[] = [];
      const t0 = Date.now();
      await page.route(URL_GLOB, async (route) => {
        hits.push({ at: Date.now() - t0, style: new URL(route.request().url()).searchParams.get("settlementStyle") ?? "" });
        await new Promise((r) => setTimeout(r, 400));
        await route.fulfill({ json: CASH });
      });
      await openApp(page, app);
      await settled(page);
      const out: Record<string, unknown> = {};
      const mark = (name: string) => { out[name] = hits.length; };
      mark("afterOpen");
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await page.getByRole("button", { name: "Add Average" }).click();
      await settled(page);
      mark("afterAddGroups(delivery)");
      await editCell(page, "Settlement Style", 0, "Cash"); // broadcast
      await page.waitForTimeout(1200);
      await settled(page);
      mark("afterBroadcastCash");
      await page.getByRole("button", { name: "Add Vanilla Group" }).click(); // new product starts from ... ?
      await page.waitForTimeout(1200);
      mark("afterAddGroupWhileDealIsCash");
      await page.getByRole("button", { name: "Clone", exact: true }).first().click();
      await page.waitForTimeout(1200);
      mark("afterCloneCashGroup");
      await editCell(page, "Settlement Style", 1, "Delivery");
      await editCell(page, "Settlement Style", 1, "Cash");
      await page.waitForTimeout(1200);
      mark("afterToggleOneProduct");
      await (await cell(page, "Settlement Style", 2)).click();
      await paste(page, "Delivery\nx\nShared C");
      await page.waitForTimeout(300);
      mark("afterPasteDelivery");
      await addDeal(page).click();
      await page.waitForTimeout(1500);
      mark("afterNewTab");
      out.fixing = await rowTexts(page, "Fixing Source");
      record("request-counts", app, out);
    });
  });
}
