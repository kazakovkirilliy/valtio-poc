import fs from "node:fs";
import path from "node:path";
import { type CDPSession, type Page, expect, test } from "@playwright/test";

const ALL_APPS = ["valtio", "mobx", "mobx-state-tree", "mobx-keystone", "legend-state", "redux", "zustand", "jotai", "effector-nested", "effector-model"] as const;
const only = process.env.PERF_APPS?.split(",").map((s) => s.trim());
const apps = ALL_APPS.filter((app) => !only || only.includes(app));
const TAG = process.env.PERF_TAG ? `-${process.env.PERF_TAG}` : "";
const REPS = Number(process.env.PERF_REPS ?? 5);
const RESULTS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "results");

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
};

/**
 * Runs before the app: a React DevTools hook that counts commits, and which components re-rendered
 * in them (fibers that "performed work", by name). Chains with the one @vitejs/plugin-react installs.
 */
const installReactHook = () => {
  const w = window as unknown as Record<string, any>;
  w.__commits = 0;
  w.__rendered = {} as Record<string, number>;
  const nameOf = (fiber: any): string | null => {
    const t = fiber.type;
    if (!t) return null;
    if (typeof t === "function") return t.displayName || t.name || null;
    if (t.displayName) return t.displayName;
    if (t.type) return t.type.displayName || t.type.name || null;
    if (t.render) return t.render.displayName || t.render.name || null;
    return null;
  };
  const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15]); // function, class, forwardRef, memo, simple memo
  const walk = (root: any) => {
    const stack = [root.current];
    while (stack.length) {
      const fiber = stack.pop();
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
      if ((fiber.flags & 1) !== 0 && COMPONENT_TAGS.has(fiber.tag)) {
        const name = nameOf(fiber);
        if (name) w.__rendered[name] = (w.__rendered[name] ?? 0) + 1;
      }
    }
  };
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject(renderer: unknown) {
      this.renderers.set(1, renderer);
      return 1;
    },
    onCommitFiberRoot(_id: number, root: unknown) {
      w.__commits += 1;
      try {
        walk(root);
      } catch {
        /* the count is a bonus */
      }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    checkDCE() {},
  };
};

const reactCounters = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __commits: number; __rendered: Record<string, number> };
    return { commits: w.__commits, rendered: { ...w.__rendered } };
  });
const diffRendered = (a: Record<string, number>, b: Record<string, number>) => {
  const out: Record<string, number> = {};
  for (const key of Object.keys(b)) if (b[key] - (a[key] ?? 0) > 0) out[key] = b[key] - (a[key] ?? 0);
  return out;
};

const heapKB = async (cdp: CDPSession) => {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  return usedSize / 1024;
};

// --- the grid, by label and column (see tests/e2e/support/fixtures.ts: settings l0/l1, deal l2, labels l3, products l4..)
const rowIndex = async (page: Page, label: string) =>
  page.locator(".deal-grid .slick-cell.l3").filter({ hasText: new RegExp(`^${label}$`) }).locator("xpath=..").getAttribute("data-row");
const cellSelector = (row: string | null, column: number) => `.deal-grid .slick-row[data-row="${row}"] > .slick-cell.l${column === 0 ? 2 : column + 3}`;

/**
 * Edits a cell the way a user does and times, inside the page, from the committing Enter to the first DOM
 * change of each watched cell (the edited one, and the ones the edit propagates to), plus React commits
 * and re-rendered components in the 300 ms after.
 */
const timedEdit = async (page: Page, label: string, column: number, text: string, watchColumns: number[]) => {
  const row = await rowIndex(page, label);
  await page.locator(cellSelector(row, column)).click();
  await page.keyboard.press("Enter");
  await page.locator(".deal-grid .grid-editor").fill(text);
  const before = await reactCounters(page);
  await page.evaluate(
    ({ selectors }) => {
      const w = window as unknown as { __mark: { t0: number; hits: Record<number, number> } };
      w.__mark = { t0: 0, hits: {} };
      document.addEventListener("keydown", (event) => { if (event.key === "Enter") w.__mark.t0 = performance.now(); }, { capture: true, once: true });
      selectors.forEach((selector, i) => {
        const el = document.querySelector(selector);
        if (!el) return;
        new MutationObserver(() => {
          if (w.__mark.hits[i] === undefined) w.__mark.hits[i] = performance.now();
        }).observe(el, { subtree: true, childList: true, characterData: true });
      });
    },
    { selectors: watchColumns.map((c) => cellSelector(row, c)) },
  );
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const after = await reactCounters(page);
  const mark = await page.evaluate(() => (window as unknown as { __mark: { t0: number; hits: Record<number, number> } }).__mark);
  return {
    latencies: watchColumns.map((_, i) => (mark.hits[i] === undefined ? null : mark.hits[i] - mark.t0)),
    commits: after.commits - before.commits,
    rendered: diffRendered(before.rendered, after.rendered),
  };
};

/** A paste of `text` at the active cell, timed in the page: the handler (store write included), then until painted. */
const timedPaste = (page: Page, text: string) =>
  page.evaluate(async (pasted) => {
    const data = new DataTransfer();
    data.setData("text/plain", pasted);
    const t0 = performance.now();
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    const syncMs = performance.now() - t0;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return { syncMs, paintMs: performance.now() - t0, status: document.querySelector(".deal-grid__status")?.textContent ?? "" };
  }, text);

const pasteBlock = (columns: number, run: number) => {
  const cells = (row: number, c: number): string => {
    const d = (n: number) => String(10 + (n % 18));
    switch (row) {
      case 0: return ["USD", "EUR", "GBP", "CHF"][run % 4];
      case 1: return String(1000 + run);
      case 2: return ["USD", "EUR"][run % 2];
      case 3: return `2030-01-${d(run + c)}`;
      case 4: return String(30 + ((run + c) % 40));
      case 5: return `2031-01-${d(run + c)}`;
      case 6: return "Delivery";
      case 7: return ["USD", "EUR"][(run + c) % 2];
      case 8: return "";
      case 9: return String(100 + ((run * 7 + c) % 800));
      case 10: return (run + c) % 2 ? "Call" : "Put";
      case 11: return (run + c) % 2 ? "Buy" : "Sell";
      case 12: return "EURUSD";
      case 13: return `cut${(run + c) % 100}`;
      case 14: return `2029-06-${d(run + c)}`;
      default: return "";
    }
  };
  return Array.from({ length: 16 }, (_, row) => Array.from({ length: columns }, (_, c) => cells(row, c)).join("\t")).join("\n");
};

test.describe.configure({ mode: "serial" });

for (const app of apps) {
  test(`${app}: browser workloads`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(installReactHook);
    const cdp = await page.context().newCDPSession(page);
    const result: Record<string, unknown> = { app };

    const t0 = Date.now();
    await page.goto(`/${app}.html`);
    await expect(page.getByText("Vanilla Group #1")).toBeVisible();
    result.firstGroupVisibleMs = Date.now() - t0; // dev server: module loading included
    await page.waitForTimeout(2500);
    result.heapKBInitial = await heapKB(cdp);

    // a valid deal, so autocalc runs after edits (the app's default switches stay on)
    await timedEdit(page, "Notional Ccy", 0, "USD", [1]);
    await page.waitForTimeout(2600);

    // --- add 50 groups through the UI buttons
    {
      const before = await reactCounters(page);
      const timing = await page.evaluate(async () => {
        const find = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as HTMLButtonElement;
        const buttons = ["Add Vanilla Group", "Add Strategy", "Add Average"].map(find);
        const t = performance.now();
        for (let i = 0; i < 50; i++) buttons[i % 3].click();
        const syncMs = performance.now() - t;
        await new Promise<void>((resolve) => {
          const check = () => (document.querySelectorAll(".deal-grid .grid-group").length >= 51 ? resolve() : requestAnimationFrame(check));
          check();
        });
        const domMs = performance.now() - t;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return { syncMs, domMs, paintMs: performance.now() - t, groups: document.querySelectorAll(".deal-grid .grid-group").length };
      });
      await page.waitForTimeout(500);
      const after = await reactCounters(page);
      result.add50 = { ...timing, commits: after.commits - before.commits, rendered: diffRendered(before.rendered, after.rendered) };
    }
    await page.waitForTimeout(2600);

    result.groupsAfterAdd = await page.evaluate(() => document.querySelectorAll(".deal-grid .grid-group").length);
    result.productColumns = await page.evaluate(() => {
      // slick renders only the visible columns: read the count from the group headers' widths instead
      return [...document.querySelectorAll<HTMLElement>(".deal-grid .grid-group")].reduce((n, el) => n + Math.round(parseFloat(el.style.width) / 160), 0);
    });
    const P = result.productColumns as number;

    // --- single edits (5 each), timed to the DOM, with React commits
    const collect = async (run: (i: number) => ReturnType<typeof timedEdit>) => {
      const rows = [];
      for (let i = 0; i < REPS + 1; i++) rows.push(await run(i));
      const measured = rows.slice(1);
      return {
        latencyMs: measured.map((r) => r.latencies),
        medianLatencyMs: [0, 1, 2].map((k) => median(measured.flatMap((r) => (r.latencies[k] === null || r.latencies[k] === undefined ? [] : [r.latencies[k] as number])))),
        commits: measured.map((r) => r.commits),
        rendered: measured[0].rendered,
      };
    };
    result.editLocal = await collect((i) => timedEdit(page, "Strike", 1, String(100 + i), [1]));
    result.editSynced = await collect((i) => timedEdit(page, "Notional Amount", 1, String(1000 + i), [1, 0, 5]));
    result.editBroadcast = await collect((i) => timedEdit(page, "Strike", 0, String(200 + i), [0, 1, 6]));

    // --- paste a block over every product: 16 rows x P columns
    {
      const row = await rowIndex(page, "Notional Ccy");
      await page.locator(cellSelector(row, 1)).click();
      const runs = [];
      for (let i = 0; i < 4; i++) {
        const before = await reactCounters(page);
        const timing = await timedPaste(page, pasteBlock(P, i));
        await page.waitForTimeout(300);
        const after = await reactCounters(page);
        runs.push({ ...timing, commits: after.commits - before.commits, rendered: diffRendered(before.rendered, after.rendered) });
      }
      const measured = runs.slice(1);
      result.paste = {
        columns: P,
        status: runs[0].status,
        syncMs: median(measured.map((r) => r.syncMs)),
        paintMs: median(measured.map((r) => r.paintMs)),
        runs,
      };
    }

    // --- D1: a deal on another tab keeps its spot stream going while it is not shown
    {
      const t1 = Date.now();
      await page.getByRole("button", { name: "Add New Deal" }).click();
      await expect(page.getByRole("button", { name: "Tab 2" })).toBeVisible();
      await page.getByText("Vanilla Group #1").waitFor();
      result.newTabMs = Date.now() - t1;
      const spotRow2 = await rowIndex(page, "Spot Stream");
      const before = Number(await page.locator(cellSelector(spotRow2, 0)).textContent());
      // back to the big deal: time its grid mounting
      const switchBack = await page.evaluate(async () => {
        const tab1 = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Tab 1") as HTMLButtonElement;
        const t = performance.now();
        tab1.click();
        await new Promise<void>((resolve) => {
          const check = () => (document.querySelectorAll(".deal-grid .grid-group").length >= 51 ? resolve() : requestAnimationFrame(check));
          check();
        });
        const domMs = performance.now() - t;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return { domMs, paintMs: performance.now() - t };
      });
      result.switchBackToBigDeal = switchBack;
      await page.waitForTimeout(4000); // Tab 2 is not shown now
      await page.getByRole("button", { name: "Tab 2" }).click();
      await page.getByText("Vanilla Group #1").waitFor();
      const after = Number(await page.locator(cellSelector(await rowIndex(page, "Spot Stream"), 0)).textContent());
      result.inactiveTabSpot = { before, after, ticksWhileHidden: after - before, secondsHidden: 4 + switchBack.paintMs / 1000, expectedAt500ms: Math.round((4 + switchBack.paintMs / 1000) * 2) };
    }

    result.consoleErrors = errors.slice(0, 5);
    result.consoleErrorCount = errors.length;
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESULTS_DIR, `browser-${app}${TAG}.json`), JSON.stringify(result, null, 2));
  });

  test(`${app}: add 50 groups, one click per task`, async ({ page }) => {
    await page.addInitScript(installReactHook);
    await page.goto(`/${app}.html`);
    await expect(page.getByText("Vanilla Group #1")).toBeVisible();
    await page.waitForTimeout(2500);
    const times = await page.evaluate(async () => {
      const find = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as HTMLButtonElement;
      const buttons = ["Add Vanilla Group", "Add Strategy", "Add Average"].map(find);
      const out: number[] = [];
      for (let i = 0; i < 50; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0)); // each click is its own task, as a user's are
        const t = performance.now();
        buttons[i % 3].click();
        for (let k = 0; k < 8; k++) await Promise.resolve(); // microtask-batched notifications (valtio, the cell notifier) land
        out.push(performance.now() - t);
      }
      return out;
    });
    const groups = await page.evaluate(() => document.querySelectorAll(".deal-grid .grid-group").length);
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(RESULTS_DIR, `browser-spaced-${app}${TAG}.json`),
      JSON.stringify({ app, groups, totalMs: times.reduce((a, b) => a + b, 0), medianMs: median(times), firstTenMedianMs: median(times.slice(0, 10)), lastTenMedianMs: median(times.slice(-10)), maxMs: Math.max(...times), times }, null, 2),
    );
  });

  test(`${app}: browser heap over add/clone/remove cycles`, async ({ page }) => {
    await page.addInitScript(installReactHook);
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`/${app}.html`);
    await expect(page.getByText("Vanilla Group #1")).toBeVisible();
    await page.waitForTimeout(2500);
    const cycle = (n: number) =>
      page.evaluate(async (count) => {
        const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
        const find = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as HTMLButtonElement;
        const last = (action: string) => {
          const all = document.querySelectorAll<HTMLElement>(`[data-group-action="${action}"]`);
          return all[all.length - 1];
        };
        const add = find("Add Strategy");
        for (let i = 0; i < count; i++) {
          add.click();
          await tick();
          last("clone").click();
          await tick();
          last("remove").click();
          await tick();
          last("remove").click();
          await tick();
        }
        return document.querySelectorAll(".deal-grid .grid-group").length;
      }, n);
    await cycle(10); // warm up
    const samples = [{ cycle: 0, kb: await heapKB(cdp) }];
    for (let k = 1; k <= 4; k++) {
      await cycle(25);
      samples.push({ cycle: 25 * k, kb: await heapKB(cdp) });
    }
    const groupsLeft = await page.evaluate(() => document.querySelectorAll(".deal-grid .grid-group").length);
    const xs = samples.map((s) => s.cycle);
    const ys = samples.map((s) => s.kb);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const slope = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0) / xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESULTS_DIR, `browser-heap-${app}${TAG}.json`), JSON.stringify({ app, samples, kbPerCycle: slope, groupsLeft }, null, 2));
  });
}
