import { apps, autocalcSwitch, collectConsole, expect, openApp, spotToggle, test } from "./helpers.ts";
import { record } from "./obs.ts";

// realistic corruption: a schema that evolved (a missing key), a hand-edited value, not-json
for (const app of apps) {
  test(`storage shapes: ${app}`, async ({ page }) => {
    const log = collectConsole(page);
    await openApp(page, app);
    await autocalcSwitch(page).click();
    await spotToggle(page).click();
    await page.waitForTimeout(300);
    const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    const keys = Object.keys(stored);
    const results: Record<string, unknown> = { keys: keys.length, stored };
    const attempt = async (name: string, values: Record<string, string>) => {
      await page.evaluate((entries) => { localStorage.clear(); for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); }, values);
      const errsBefore = log.filter((l) => l.type === "pageerror" || l.type === "error").length;
      await page.goto(`/${app}.html`);
      const ok = await page.getByText("Vanilla Group #1").waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false);
      results[name] = {
        ok,
        auto: ok ? await autocalcSwitch(page).isChecked() : null,
        spot: ok ? (await spotToggle(page).textContent())?.includes("Enabled") : null,
        errors: log.filter((l) => l.type === "pageerror" || l.type === "error").slice(errsBefore).map((l) => l.text.slice(0, 110)),
      };
    };
    // shape per app: take the stored value of the first key as the template
    const first = keys[0];
    const asObj = (o: Record<string, unknown>) => ({ ...Object.fromEntries(keys.map((k) => [k, JSON.stringify(o)])) });
    if (keys.length === 1) {
      await attempt("empty-object", { [first]: "{}" });
      await attempt("only-autocalc-false", { [first]: JSON.stringify({ isAutocalcEnabled: false }) });
      await attempt("only-spot-false", { [first]: JSON.stringify({ isSpotPriceStreamEnabled: false }) });
      await attempt("wrapped-zustand-shape?", { [first]: JSON.stringify({ state: { isAutocalcEnabled: false }, version: 0 }) });
    } else {
      // effector: one key per switch
      await attempt("not-json", Object.fromEntries(keys.map((k) => [k, "{not json"])));
      await attempt("non-boolean", Object.fromEntries(keys.map((k) => [k, "\"yes\""])));
      await attempt("one-key-only-false", { [first]: "false" });
    }
    await attempt("array", Object.fromEntries(keys.map((k) => [k, "[]"])));
    await attempt("null", Object.fromEntries(keys.map((k) => [k, "null"])));
    await attempt("number", Object.fromEntries(keys.map((k) => [k, "42"])));
    await attempt("not-json-all", Object.fromEntries(keys.map((k) => [k, "{not json"])));
    record("storage-shapes", app, results);
  });
}
