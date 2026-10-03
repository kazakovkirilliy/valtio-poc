import { test as base, expect, type Page } from "@playwright/test";

export const apps = ["valtio", "mobx", "effector", "effector-nested"] as const;
export type App = (typeof apps)[number];

export const FIXING_SOURCES_URL = "https://jsonplaceholder.typicode.com/users";

/** Opens an app and waits for its first group. */
export const openApp = async (page: Page, app: App) => {
  await page.goto(`/${app}.html`);
  await expect(page.getByText("Vanilla Group #1")).toBeVisible();
};

// --- the deal grid. Columns: 0 = the deal, 1.. = the products in display
// order (the labels column, between them, is not counted).

const cellClass = (column: number) => `l${column === 0 ? 0 : column + 1}`;

/** The grid row of a field, by its label. */
const rowOf = async (page: Page, label: string) => {
  const labelCell = page.locator(".deal-grid .slick-cell.l1").filter({ hasText: new RegExp(`^${label}$`) });
  return labelCell.locator("xpath=..").getAttribute("data-row");
};

/** A field's cell in a column. */
export const cell = async (page: Page, label: string, column: number) =>
  page.locator(`.deal-grid .slick-row[data-row="${await rowOf(page, label)}"] > .slick-cell.${cellClass(column)}`);

/** A field's row as shown: the deal's cell, then each product's. */
export const rowTexts = async (page: Page, label: string) => {
  const row = await rowOf(page, label);
  return page.locator(`.deal-grid .slick-row[data-row="${row}"] > .slick-cell`).evaluateAll((cells) =>
    cells
      .map((el) => ({ el, index: Number([...el.classList].find((name) => /^l\d+$/.test(name))!.slice(1)) }))
      .filter(({ index }) => index !== 1)
      .sort((a, b) => a.index - b.index)
      .map(({ el }) => el.textContent ?? ""),
  );
};

/** The active cell, as its field's label and its column. */
export const activeCell = (page: Page) =>
  page.locator(".deal-grid .slick-cell.active").evaluate((active) => {
    const row = (active.parentElement as HTMLElement).dataset.row;
    const label = document.querySelector(`.deal-grid .slick-row[data-row="${row}"] > .slick-cell.l1`)?.textContent;
    const index = Number([...active.classList].find((name) => /^l\d+$/.test(name))!.slice(1));
    return { label, column: index === 0 ? 0 : index - 1 };
  });

/** Edits a cell as a user would: Enter to edit, type (or pick an option by label), Enter to commit. */
export const editCell = async (page: Page, label: string, column: number, text: string) => {
  await (await cell(page, label, column)).click();
  await page.keyboard.press("Enter");
  const editor = page.locator(".deal-grid .grid-editor");
  if ((await editor.evaluate((el) => el.tagName)) === "SELECT") await editor.selectOption({ label: text });
  else await editor.fill(text);
  await page.keyboard.press("Enter");
};

/** A clipboard event on the grid, as Ctrl/Cmd+C or V sends it; returns what a copy put on the clipboard. */
const clipboard = (page: Page, type: "copy" | "paste", text = "") =>
  page.evaluate(
    ([type, text]) => {
      const data = new DataTransfer();
      if (text) data.setData("text/plain", text);
      document.activeElement!.dispatchEvent(new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true }));
      return data.getData("text/plain");
    },
    [type, text] as const,
  );
export const copy = (page: Page) => clipboard(page, "copy");
export const paste = (page: Page, text: string) => clipboard(page, "paste", text);

/**
 * Every test fails on a console or page error, unless it lists the errors it
 * expects (`expectedErrors`, matched as substrings).
 */
export const test = base.extend<{ expectedErrors: string[]; errorWatch: void }>({
  expectedErrors: [[], { option: true }],
  errorWatch: [
    async ({ page, expectedErrors }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await use();
      const unexpected = errors.filter((error) => !expectedErrors.some((e) => error.includes(e)));
      expect(unexpected, "console/page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
