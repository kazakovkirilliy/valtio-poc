import type { Page } from "@playwright/test";
import { FIXING_SOURCES_URL, apps, control, expect, openApp, test, values } from "./support/fixtures.ts";

const lists: Record<string, { id: number; name: string }[]> = {
  Delivery: [{ id: 1, name: "Delivery A" }, { id: 2, name: "Delivery B" }, { id: 3, name: "Shared C" }],
  Cash: [{ id: 4, name: "Cash D" }, { id: 3, name: "Shared C" }], // first is 4; 3 is in both
};

const selectedText = (page: Page, label: string, n: number) =>
  control(page, label, n).evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? "");
const fixingLoaded = (page: Page, n: number) => expect(control(page, "Fixing Source", n)).toBeEnabled();

for (const app of apps) {
  test.describe(app, () => {
    test("Fixing Source follows each product's Settlement Style", async ({ page }) => {
      await page.route(`${FIXING_SOURCES_URL}?*`, async (route) => {
        const style = new URL(route.request().url()).searchParams.get("settlementStyle") ?? "";
        await new Promise((resolve) => setTimeout(resolve, 500)); // so loading is visible
        await route.fulfill({ json: lists[style] ?? [] });
      });
      await openApp(page, app);

      // Settlement Style: a fixed list, Delivery by default
      await expect(control(page, "Settlement Style", 1)).toHaveValue("Delivery");
      expect(await control(page, "Settlement Style", 1).evaluate((el) =>
        [...(el as HTMLSelectElement).options].map((o) => o.value))).toEqual(["Cash", "Delivery"]);

      // Fixing Source: loading, then Delivery's options with the first selected
      await expect(control(page, "Fixing Source", 1)).toBeDisabled();
      expect(await selectedText(page, "Fixing Source", 1)).toBe("Loading…");
      await fixingLoaded(page, 1);
      expect(await selectedText(page, "Fixing Source", 1)).toBe("Delivery A");
      expect(await selectedText(page, "Settlement Style", 0)).toBe("—"); // the deal holds nothing
      expect(await selectedText(page, "Fixing Source", 0)).toBe("—");

      // a style change reloads; a value that is still an option is kept
      await control(page, "Fixing Source", 1).selectOption("3");
      await control(page, "Settlement Style", 1).selectOption("Cash");
      await expect(control(page, "Fixing Source", 1)).toBeDisabled();
      await fixingLoaded(page, 1);
      expect(await selectedText(page, "Fixing Source", 1)).toBe("Shared C");

      // …and one that isn't is reset to the first option
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await fixingLoaded(page, 2);
      // Cash is already loaded: the list shows at once (no "Loading…" flash),
      // and the value is reconciled when the reload settles
      await control(page, "Settlement Style", 2).selectOption("Cash");
      await expect(control(page, "Fixing Source", 2)).toBeEnabled();
      await expect(control(page, "Fixing Source", 2)).toHaveValue("4");
      expect(await selectedText(page, "Fixing Source", 2)).toBe("Cash D");
      expect((await values(page, "Fixing Source")).slice(1)).toEqual(["3", "4", "1"]);

      // broadcast the style: every product reloads and reconciles
      await control(page, "Settlement Style", 0).selectOption("Cash");
      await expect.poll(() => values(page, "Settlement Style")).toEqual(["", "Cash", "Cash", "Cash"]);
      await expect.poll(() => values(page, "Fixing Source")).toEqual(["", "3", "4", "4"]);
    });

    test.describe("when the request fails", () => {
      test.use({ expectedErrors: ["Failed to load resource"] });

      test("the dropdown says so and the rest of the app still works", async ({ page }) => {
        await page.route(`${FIXING_SOURCES_URL}?*`, (route) => route.abort());
        await openApp(page, app);
        await expect.poll(() => selectedText(page, "Fixing Source", 1)).toBe("Failed to load");
        await expect(control(page, "Fixing Source", 1)).toBeDisabled();
        await control(page, "Strike", 1).fill("1");
        await control(page, "Strike", 1).press("Enter");
        await expect(control(page, "Strike", 1)).toHaveValue("1");
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
      await expect(control(page, "Fixing Source", 1)).toBeEnabled({ timeout: 15000 });
      expect(sent).toContain("Delivery");
      expect(await selectedText(page, "Fixing Source", 1)).toBe("Leanne Graham");
      await control(page, "Settlement Style", 1).selectOption("Cash");
      await expect(control(page, "Fixing Source", 1)).toBeEnabled({ timeout: 15000 });
      expect(sent).toContain("Cash");
      await expect(control(page, "Fixing Source", 1)).toHaveValue("1"); // same data: kept
    });
  });
}
