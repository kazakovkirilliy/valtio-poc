import type { Page } from "@playwright/test";
import { apps, commitText, expect, openApp, test } from "./support/fixtures.ts";

/**
 * Counts component renders the way React DevTools' "highlight updates" does:
 * a fiber rendered if it is new (mount) or has the PerformedWork flag; an
 * unchanged child pointer means a reused, un-rendered subtree. Each render is
 * tagged with its component, its `label` prop and the group (key) it is in.
 */
const installRenderLog = () => {
  type Fiber = {
    tag: number; key: string | null; flags: number; child: Fiber | null; sibling: Fiber | null;
    return: Fiber | null; alternate: Fiber | null; memoizedProps: Record<string, unknown> | null;
    type: { displayName?: string; name?: string } | string | null;
    elementType: { displayName?: string } | null;
  };
  type Render = { name: string; label?: string; group?: string; mount: boolean };
  const w = window as unknown as { __renders: Render[]; __recording: boolean; __REACT_DEVTOOLS_GLOBAL_HOOK__: object };
  w.__renders = [];
  w.__recording = false;
  const nameOf = (f: Fiber) =>
    f.elementType?.displayName ||
    (typeof f.type === "object" || typeof f.type === "function" ? f.type?.displayName || f.type?.name : undefined);
  const groupOf = (f: Fiber) => {
    for (let a: Fiber | null = f; a; a = a.return) if (nameOf(a) === "GroupColumn") return a.key ?? undefined;
    return undefined;
  };
  const tracked = new Set(["Input", "Select", "GroupColumn", "ProductColumn"]);
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject() { return 1; },
    checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id: number, root: { current: Fiber }) {
      if (!w.__recording) return;
      const walk = (fiber: Fiber, previous: Fiber | null) => {
        const name = [0, 1, 11, 14, 15].includes(fiber.tag) ? nameOf(fiber) : undefined;
        if (name && tracked.has(name) && (!previous || (fiber.flags & 1) === 1)) {
          w.__renders.push({ name, label: fiber.memoizedProps?.label as string | undefined, group: groupOf(fiber), mount: !previous });
        }
        if (previous && fiber.child === previous.child) return;
        for (let child = fiber.child; child; child = child.sibling) walk(child, child.alternate);
      };
      walk(root.current, root.current.alternate);
    },
  };
};

type Render = { name: string; label?: string; group?: string; mount: boolean };

const record = async (page: Page, action: () => Promise<void>): Promise<Render[]> => {
  await page.evaluate(() => {
    const w = window as unknown as { __renders: unknown[]; __recording: boolean };
    w.__renders = [];
    w.__recording = true;
  });
  await action();
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const w = window as unknown as { __renders: Render[]; __recording: boolean };
    w.__recording = false;
    return w.__renders;
  });
};

for (const app of apps) {
  test.describe(app, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(installRenderLog);
      await openApp(page, app);
      await page.getByRole("button", { name: "Add Strategy" }).click();
      await expect(page.getByText("Strategy #2")).toBeVisible();
      await page.waitForTimeout(800); // let the fixing sources settle
    });

    test("adding a group re-renders nothing that already exists", async ({ page }) => {
      const renders = await record(page, async () => {
        await page.getByRole("button", { name: "Add Average" }).click();
        await expect(page.getByText("Average #3")).toBeVisible();
      });
      const newGroup = renders.find((r) => r.name === "GroupColumn" && r.mount)?.group;
      expect(newGroup).toBeTruthy();
      const existing = renders.filter((r) => !r.mount && r.group !== newGroup);
      expect(existing).toEqual([]);
    });

    test("editing a field re-renders only that field's input", async ({ page }) => {
      const renders = await record(page, () => commitText(page, "Strike", 1, "1"));
      expect(renders.filter((r) => r.mount)).toEqual([]);
      expect([...new Set(renders.map((r) => r.label))]).toEqual(["Strike"]);
    });

    test("a broadcast re-renders only the broadcast field's inputs", async ({ page }) => {
      const renders = await record(page, () => commitText(page, "Strike", 0, "7"));
      expect([...new Set(renders.map((r) => r.label))]).toEqual(["Strike"]);
    });

    test("a synced ccy re-renders only that ccy's inputs", async ({ page }) => {
      const renders = await record(page, () => commitText(page, "Premium Ccy", 0, "EUR"));
      expect([...new Set(renders.map((r) => r.label))]).toEqual(["Premium Ccy"]);
    });
  });
}
