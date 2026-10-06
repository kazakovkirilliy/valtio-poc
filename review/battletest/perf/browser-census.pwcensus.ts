// Heap snapshots of one app in the browser around N add/clone/remove cycles (PERF_APP, PERF_CYCLES, PERF_SNAP_DIR), for heapdiff.mjs / retainers.mjs
import fs from "node:fs";
import path from "node:path";
import { type CDPSession, expect, test } from "@playwright/test";

const app = process.env.PERF_APP ?? "zustand";
const cycles = Number(process.env.PERF_CYCLES ?? 100);
const dir = process.env.PERF_SNAP_DIR ?? "/tmp";

const snapshot = async (cdp: CDPSession, file: string) => {
  const chunks: string[] = [];
  const onChunk = (event: { chunk: string }) => chunks.push(event.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, chunks.join(""));
};

test(`${app}: browser heap census`, async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
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
    }, n);
  await cycle(20);
  await snapshot(cdp, path.join(dir, `browser-${app}-a.heapsnapshot`));
  await cycle(cycles);
  await snapshot(cdp, path.join(dir, `browser-${app}-b.heapsnapshot`));
});
