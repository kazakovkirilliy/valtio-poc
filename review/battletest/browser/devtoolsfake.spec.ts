import { addDeal, apps, cell, collectConsole, editCell, expect, openApp, paste, settled, test } from "./helpers.ts";
import { record } from "./obs.ts";

// a fake Redux DevTools extension: counts what each app reports, and throws nothing; ?debug logging on top
for (const app of apps) {
  test(`fake devtools extension + ?debug: ${app}`, async ({ page }) => {
    const log = collectConsole(page);
    await page.addInitScript(() => {
      const w = window as unknown as { __sent: Record<string, { n: number; types: Set<string> }>; __REDUX_DEVTOOLS_EXTENSION__: unknown };
      w.__sent = {};
      w.__REDUX_DEVTOOLS_EXTENSION__ = {
        connect: ({ name }: { name: string }) => {
          const key = name.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<id>");
          w.__sent[key] = w.__sent[key] ?? { n: 0, types: new Set() };
          return {
            init: () => undefined,
            send: (action: { type: string }, state: unknown) => {
              JSON.stringify(state); // the extension serialises every state: a cycle or BigInt throws
              w.__sent[key].n++;
              w.__sent[key].types.add(action.type);
            },
            subscribe: () => () => undefined,
          };
        },
      };
    });
    await page.goto(`/${app}.html?debug`);
    await expect(page.getByText("Vanilla Group #1")).toBeVisible();
    await page.getByRole("button", { name: "Add Strategy" }).click();
    await editCell(page, "Notional Ccy", 0, "USD");
    await editCell(page, "Notional Amount", 0, ""); // NaN
    await editCell(page, "Notional Amount", 1, "Infinity");
    await (await cell(page, "Strike", 1)).click();
    await paste(page, "1\t2\t3\nCall\tPut\tCall");
    await editCell(page, "Settlement Style", 1, "Cash");
    await settled(page);
    await addDeal(page).click();
    await page.waitForTimeout(1500);
    const sent = await page.evaluate(() => Object.fromEntries(Object.entries((window as unknown as { __sent: Record<string, { n: number; types: Set<string> }> }).__sent).map(([k, v]) => [k, { n: v.n, types: [...v.types].slice(0, 4) }])));
    const errors = log.filter((l) => l.type === "error" || l.type === "pageerror" || l.type === "warning").map((l) => `${l.type}: ${l.text.slice(0, 160)}`);
    const debugLines = log.filter((l) => l.type === "log").length;
    record("devtools-fake", app, { instances: Object.keys(sent).length, errors, debugLinesAbove0: debugLines > 0 });
    console.log(`DEVTOOLS ${app} debugLines=${debugLines} instances=${JSON.stringify(Object.entries(sent).map(([k, v]) => `${k}:${v.n}`))}`);
  });
}
