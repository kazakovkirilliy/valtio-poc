import { test, type Page } from "@playwright/test";
import { apps, cell, editCell, expect, openApp, paste, rowTexts } from "../../e2e/support/fixtures.ts";

// the plain Playwright `test`: no auto console-error failure, specs collect the console themselves
export { apps, cell, editCell, expect, openApp, paste, rowTexts, test };
export type { App } from "../../e2e/support/fixtures.ts";

/** Console messages (all levels) and page errors, collected for a page. */
export const collectConsole = (page: Page) => {
  const log: { type: string; text: string }[] = [];
  page.on("console", (m) => log.push({ type: m.type(), text: m.text() }));
  page.on("pageerror", (e) => log.push({ type: "pageerror", text: String(e) }));
  return log;
};

export const groupTitles = (page: Page) => page.locator(".deal-grid .grid-group__title").allTextContents();
export const productHeaders = (page: Page) => page.locator(".deal-grid .slick-header-column.grid-header--product").allTextContents();
export const tabButtons = (page: Page) => page.locator(".multi-deal__tabs button").allTextContents();
export const tab = (page: Page, n: number) => page.getByRole("button", { name: `Tab ${n}`, exact: true });
export const addDeal = (page: Page) => page.getByRole("button", { name: "Add New Deal" });
export const spotToggle = (page: Page) => page.getByRole("button", { name: /Toggle Spot Price Stream/ });
export const autocalcSwitch = (page: Page) => page.getByRole("switch", { name: "Autocalc" });
export const calcButton = (page: Page) => page.getByRole("button", { name: "Calculate" });
export const priceOut = (page: Page) => page.getByLabel("Price");
export const pasteStatus = (page: Page) => page.locator(".deal-grid__status");

/** Every visible field row of the grid: label -> [deal, ...products] as shown. */
export const dump = async (page: Page) => {
  return page.evaluate(() => {
    const out: Record<string, string[]> = {};
    const rows = [...document.querySelectorAll(".deal-grid .slick-row")] as HTMLElement[];
    const byRow = new Map<string, HTMLElement[]>();
    for (const r of rows) {
      const k = r.dataset.row!;
      byRow.set(k, [...(byRow.get(k) ?? []), r]);
    }
    for (const [, parts] of [...byRow.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const cells = parts.flatMap((p) => [...p.querySelectorAll(":scope > .slick-cell")] as HTMLElement[]);
      const idx = (el: HTMLElement) => Number([...el.classList].find((n) => /^l\d+$/.test(n))!.slice(1));
      const sorted = cells.sort((a, b) => idx(a) - idx(b));
      const label = sorted.find((c) => idx(c) === 3)?.textContent ?? "?";
      out[label] = sorted.filter((c) => idx(c) === 2 || idx(c) >= 4).map((c) => (c.textContent ?? "") + (c.className.includes("grid-cell--error") ? " [ERR]" : "") + (c.className.includes("grid-cell--none") ? " [none]" : ""));
    }
    return out;
  });
};

/** Wait until the grid has settled (options loaded: no Loading… cell). */
export const settled = async (page: Page) => {
  await expect(page.locator(".deal-grid .slick-cell", { hasText: "Loading…" })).toHaveCount(0, { timeout: 15000 });
};

/** Counts live setInterval(…, 500) timers: install with page.addInitScript before goto. */
export const intervalProbeScript = () => {
  const w = window as unknown as { __intervals: Map<number, number>; __ticks: number };
  w.__intervals = new Map();
  const origSet = window.setInterval.bind(window);
  const origClear = window.clearInterval.bind(window);
  window.setInterval = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => {
    const id = origSet(fn as () => void, ms, ...(rest as []));
    w.__intervals.set(id as unknown as number, ms ?? 0);
    return id;
  }) as typeof window.setInterval;
  window.clearInterval = ((id?: number) => {
    w.__intervals.delete(id as number);
    return origClear(id);
  }) as typeof window.clearInterval;
};
export const liveIntervals = (page: Page) =>
  page.evaluate(() => [...(window as unknown as { __intervals: Map<number, number> }).__intervals.values()].filter((ms) => ms === 500).length);
