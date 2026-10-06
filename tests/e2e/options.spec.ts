import { FIXING_SOURCES_URL, apps, cell, editCell, expect, openApp, rowTexts, test } from "./support/fixtures.ts";

const lists: Record<string, { id: number; name: string }[]> = {
  Delivery: [{ id: 1, name: "Delivery A" }, { id: 2, name: "Delivery B" }, { id: 3, name: "Shared C" }],
  Cash: [{ id: 4, name: "Cash D" }, { id: 3, name: "Shared C" }], // first is 4; 3 is in both
};
const MISSING = /grid-cell--none/;

for (const app of apps) {
  test.describe(app, () => {
    test("Fixing Source exists only for a Cash Settlement Style", async ({ page }) => {
      await page.route(`${FIXING_SOURCES_URL}?*`, async (route) => {
        const style = new URL(route.request().url()).searchParams.get("settlementStyle") ?? "";
        await new Promise((resolve) => setTimeout(resolve, 500)); // so loading is visible
        await route.fulfill({ json: lists[style] ?? [] });
      });
      await openApp(page, app);

      // Settlement Style: Delivery by default; the deal holds nothing
      expect(await rowTexts(page, "Settlement Style")).toEqual(["", "Delivery"]);
      // a Delivery product has no Fixing Source; the deal's offers Cash's options
      await expect(await cell(page, "Fixing Source", 1)).toHaveClass(MISSING);
      await expect(await cell(page, "Fixing Source", 0)).toHaveText("Loading…");
      await expect(await cell(page, "Fixing Source", 0)).toHaveText("", { timeout: 5000 });

      // Cash adds it, with the first option
      await editCell(page, "Settlement Style", 1, "Cash");
      await expect(await cell(page, "Fixing Source", 1)).toHaveText("Cash D", { timeout: 5000 });
      await editCell(page, "Fixing Source", 1, "Shared C");

      // broadcast the style: new Cash products get the first option, a value that is still an option is kept
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await editCell(page, "Settlement Style", 0, "Cash");
      await expect.poll(() => rowTexts(page, "Settlement Style")).toEqual(["", "Cash", "Cash", "Cash"]);
      await expect.poll(() => rowTexts(page, "Fixing Source"), { timeout: 5000 }).toEqual(["", "Shared C", "Cash D", "Cash D"]);

      // leaving Cash removes it
      await editCell(page, "Settlement Style", 2, "Delivery");
      await expect(await cell(page, "Fixing Source", 2)).toHaveClass(MISSING);
    });

    test.describe("when the request fails", () => {
      test.use({ expectedErrors: ["Failed to load resource"] });

      test("the cell says so and the rest of the app still works", async ({ page }) => {
        await page.route(`${FIXING_SOURCES_URL}?*`, (route) => route.abort());
        await openApp(page, app);
        await expect(await cell(page, "Fixing Source", 0)).toHaveText("Failed to load", { timeout: 5000 });
        await editCell(page, "Strike", 1, "1");
        await expect(await cell(page, "Strike", 1)).toHaveText("1");
      });
    });

    test("against the real API: the style is sent as a parameter", async ({ page }) => {
      const sent: string[] = [];
      page.on("request", (request) => {
        if (request.url().startsWith(FIXING_SOURCES_URL)) {
          sent.push(new URL(request.url()).searchParams.get("settlementStyle") ?? "");
        }
      });
      await openApp(page, app);
      await editCell(page, "Settlement Style", 1, "Cash");
      await expect(await cell(page, "Fixing Source", 1)).toHaveText("Leanne Graham", { timeout: 15000 });
      expect(sent).toContain("Cash");
      expect(sent).not.toContain("Delivery"); // a Delivery product loads nothing
    });
  });
}
