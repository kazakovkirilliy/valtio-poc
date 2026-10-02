import { test as base, expect, type Page } from "@playwright/test";

export const apps = ["valtio", "mobx", "effector"] as const;
export type App = (typeof apps)[number];

export const FIXING_SOURCES_URL = "https://jsonplaceholder.typicode.com/users";

/** Opens an app and waits for its first group. */
export const openApp = async (page: Page, app: App) => {
  await page.goto(`/${app}.html`);
  await expect(page.getByText("Vanilla Group #1")).toBeVisible();
};

/** The n-th control with this accessible name (0 = the deal column). */
export const control = (page: Page, label: string, n: number) =>
  page.locator(`[aria-label="${label}"]`).nth(n);

/** Types a value and commits it with Enter. */
export const commitText = async (page: Page, label: string, n: number, value: string) => {
  const input = control(page, label, n);
  await input.fill(value);
  await input.press("Enter");
};

export const values = (page: Page, label: string) =>
  page.locator(`[aria-label="${label}"]`).evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));

export const hasError = (page: Page, label: string, n: number) =>
  control(page, label, n).evaluate((el) => el.classList.contains("input--error"));

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
