import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AppName,
  type DealHandle,
  type Page,
  appNames,
  exactJson,
  flush,
  installControlledApi,
  launch,
  mockCalculate,
  ops,
  saveResults,
} from "./support/harness.ts";
import { createAdapter } from "../../stores/support/adapters.ts";

/**
 * A listener that writes back when it hears a change (deal logic as a
 * subscriber, as the original app's grid or devtools might), and two decks
 * built by the repo's own `createAdapter`, side by side. Throwing listeners
 * are in throwingListener.test.ts: one can break a library for the rest of
 * its file.
 */

const seen: Record<string, Partial<Record<AppName, unknown>>> = {};
const note = (key: string, app: AppName, value: unknown) => {
  if (!seen[key]) seen[key] = {};
  seen[key][app] = value;
};

describe.each(appNames)("%s: listeners that act", (app) => {
  let page: Page;
  let h: DealHandle;
  let d: ReturnType<typeof ops>;

  beforeEach(async () => {
    installControlledApi({ Cash: [{ id: 4, name: "C4" }, { id: 3, name: "Shared" }] }, "auto");
    mockCalculate("manual");
    page = await launch(app);
    [h] = page.deals;
    d = ops(h.deal);
    h.deal.addGroup("Strategy");
    d.write([{ path: "notionalCcy", value: "USD" }]);
    await flush();
  });
  afterEach(() => {
    h.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a listener that writes when it hears a change: its write lands, is reported, and doesn't loop", async () => {
    let reactions = 0;
    const heard: string[] = [];
    const stop = h.deal.subscribe((change) => {
      heard.push(change.kind);
      if (change.kind !== "products") return;
      // when product 0's strike is 1 and its call/put empty, fill it in
      if (d.read(0, "strike") === "1" && d.read(0, "callPut") === "") {
        reactions++;
        d.commit(0, "callPut", "Call");
      }
    });
    d.commit(0, "strike", "1");
    await flush();
    stop();
    const result = { reactions, strike: d.read(0, "strike"), callPut: d.read(0, "callPut"), sibling: d.read(1, "callPut"), productEmits: heard.filter((kind) => kind === "products").length };
    note("a listener that writes back", app, result);
    expect(result).toMatchObject({ reactions: 1, strike: "1", callPut: "Call", sibling: "" });
    expect(result.productEmits).toBeGreaterThanOrEqual(2); // the edit, then the listener's own write
  });

});

describe.each(appNames)("%s: two decks from the repo's createAdapter", (app) => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("each has its own modules and switches: no cross-talk", async () => {
    installControlledApi({ Cash: [{ id: 4, name: "C4" }] }, "auto");
    mockCalculate("auto");
    const first = await createAdapter(app);
    const second = await createAdapter(app);
    first.addGroup("VanillaGroup");
    second.addGroup("VanillaGroup");
    first.sync("notionalCcy", "USD");
    second.sync("notionalCcy", "USD");
    await flush();
    const changes: string[] = [];
    const stop = second.deal().subscribe((change) => changes.push(change.kind));
    first.setAutocalc(true);
    first.commit(0, "strike", "9");
    first.addGroup("Average");
    await flush();
    stop();
    expect(changes).toEqual([]);
    expect([second.read(0, "strike"), second.groupCount(), second.calc().status]).toEqual(["", 1, "none"]);
    expect(first.calc().status).toBe("done");
    first.dispose();
    second.dispose();
  });
});

describe("listeners: do the apps agree?", () => {
  afterAll(() => saveResults("reentrancy", seen));
  it("a listener that writes back", () => {
    const values = Object.values(seen["a listener that writes back"] ?? {}).map((value) => exactJson({ ...(value as object), productEmits: undefined }));
    expect(new Set(values).size, JSON.stringify(seen["a listener that writes back"], null, 1)).toBe(1);
  });
});
