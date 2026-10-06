import type { Page } from "@playwright/test";
import { apps, cell, expect, openApp, pasteStatus, rowTexts, settled, test } from "./helpers.ts";
import { copy, paste } from "../../e2e/support/fixtures.ts";
import { record } from "./obs.ts";

const URL_GLOB = "https://jsonplaceholder.typicode.com/users?*";
const CASH = [{ id: 4, name: "Cash D" }, { id: 3, name: "Shared C" }];

for (const app of apps) {
  test(`O6 paste of a style plus the fixing source it creates: ${app}`, async ({ page }) => {
    await page.route(URL_GLOB, async (route) => {
      await new Promise((r) => setTimeout(r, 150));
      await route.fulfill({ json: CASH });
    });
    await openApp(page, app);
    await page.getByRole("button", { name: "Add Strategy" }).click();
    await settled(page);
    const out: Record<string, unknown> = {};
    const probe = async (col: number) => {
      const c = await cell(page, "Fixing Source", col);
      const shown = await c.textContent();
      await c.click();
      await page.keyboard.press("Enter");
      const editor = page.locator(".grid-editor");
      const sel = await editor.evaluate((el) => {
        const s = el as HTMLSelectElement;
        return { value: s.value, selectedText: s.selectedOptions[0]?.textContent ?? null, options: [...s.options].map((o) => `${o.value}=${o.textContent}`) };
      });
      await page.keyboard.press("Escape");
      return { shown, ...sel };
    };
    // options are loaded (Cash list cached); a Delivery product has no Fixing Source cell
    await (await cell(page, "Settlement Style", 1)).click();
    await paste(page, "Cash\n\nShared C");
    out.labelWithStyle = { status: await pasteStatus(page).textContent(), ...(await probe(1)) };
    await (await cell(page, "Settlement Style", 2)).click();
    await paste(page, "Cash\n\nBogus");
    await page.waitForTimeout(500);
    out.bogusWithStyle = { status: await pasteStatus(page).textContent(), ...(await probe(2)) };
    // the same label pasted into an EXISTING cell maps to the option value
    await (await cell(page, "Fixing Source", 1)).click();
    await paste(page, "Cash D");
    out.labelIntoExisting = await probe(1);
    // the value (id) instead of label, with style
    await (await cell(page, "Settlement Style", 3)).click();
    await paste(page, "Cash\n\n3");
    out.valueWithStyle = { status: await pasteStatus(page).textContent(), ...(await probe(3)) };
    // wait for the reload the style write triggered (fake latency 1 s + request), then look again
    await page.waitForTimeout(2500);
    out.afterReloadLabel = await probe(1);
    out.afterReloadBogus = await probe(2);
    out.afterReloadValue = await probe(3);
    // calculation: does a bogus fixing source stop anything? validation flag?
    out.bogusErrFlag = /grid-cell--error/.test((await (await cell(page, "Fixing Source", 2)).getAttribute("class")) ?? "");
    // copy the cell
    await (await cell(page, "Fixing Source", 2)).click();
    out.copyBogus = await copy(page);
    record("o6-paste-label", app, out);
  });
}
