import { describe, expect, it, vi } from "vitest";
import { createWorkspace, parseWorkspaceSnapshot } from "../src/state/workspace.ts";
import { saveWorkspaceDraft } from "../src/data/apolloGateway.ts";

describe("workspace behavior", () => {
  it("keeps shared edits canonical and workspaces isolated", () => {
    const first = createWorkspace();
    const second = createWorkspace();
    first.actions.addRows(100);
    first.store.set(first.baseCode.value, "EDIT");
    expect(first.toSnapshot().baseCode).toBe("EDIT");
    expect(first.toSnapshot().rows).toHaveLength(101);
    expect(first.toSnapshot().rows[0]).not.toHaveProperty("baseCode");
    expect(second.toSnapshot().baseCode).toBe("BASE");
    expect(second.store.get(second.dirty)).toBe(false);
  });

  it("notifies only the edited field, preserving list identity across 1,000 rows", () => {
    const workspace = createWorkspace();
    workspace.actions.addRows(999);
    const before = workspace.store.get(workspace.rows);
    const listeners = before.map((row) => {
      const callback = vi.fn();
      return { callback, stop: workspace.store.sub(row.level.value, callback) };
    });
    const list = vi.fn();
    const stopList = workspace.store.sub(workspace.rows, list);
    workspace.store.set(before[500].level.value, "123");
    expect(listeners[500].callback).toHaveBeenCalledTimes(1);
    expect(listeners.filter(({ callback }) => callback.mock.calls.length)).toHaveLength(1);
    expect(workspace.store.get(workspace.rows)).toBe(before);
    expect(list).not.toHaveBeenCalled();
    workspace.store.set(before[500].level.value, "123");
    expect(listeners[500].callback).toHaveBeenCalledTimes(1);
    listeners.forEach(({ stop }) => stop());
    stopList();
  });

  it("applies broadcasts atomically, including repeated values and clearing", () => {
    const workspace = createWorkspace();
    workspace.actions.addRows(999);
    const observed: number[] = [];
    const stop = workspace.store.sub(workspace.errorCount, () => {
      const values = workspace.toSnapshot().rows.map((row) => row.level);
      expect(new Set(values).size).toBe(1);
      observed.push(workspace.store.get(workspace.errorCount));
    });
    workspace.actions.broadcastLevel("long");
    expect(observed).toEqual([1_000]);
    workspace.actions.broadcastLevel("long");
    expect(observed).toEqual([1_000]);
    stop();
    workspace.store.set(workspace.store.get(workspace.rows)[0].level.value, "123");
    workspace.actions.broadcastLevel("long");
    expect(workspace.toSnapshot().rows.every((row) => row.level === "long")).toBe(true);
    workspace.actions.broadcastLevel("");
    expect(workspace.toSnapshot().rows.every((row) => row.level === "")).toBe(true);
    expect(workspace.store.get(workspace.errorCount)).toBe(0);
    workspace.actions.addRows();
    expect(workspace.toSnapshot().rows.at(-1)?.level).toBe("");
  });

  it("cleans validation on removal and ignores stale row edits", () => {
    const workspace = createWorkspace();
    const row = workspace.store.get(workspace.rows)[0];
    workspace.store.set(row.level.value, "invalid");
    expect(workspace.store.get(workspace.errorCount)).toBe(1);
    workspace.actions.removeRow(row);
    const revision = workspace.store.get(workspace.revision);
    workspace.actions.removeRow(row);
    workspace.store.set(row.level.value, "1");
    expect(workspace.store.get(workspace.errorCount)).toBe(0);
    expect(workspace.store.get(workspace.revision)).toBe(revision);
    expect(workspace.toSnapshot().rows).toEqual([]);
  });

  it("round-trips plain snapshots, rejects malformed and duplicate identities", () => {
    const workspace = createWorkspace();
    workspace.actions.addRows(10);
    workspace.actions.broadcastLevel("123");
    expect(createWorkspace(JSON.parse(JSON.stringify(workspace.toSnapshot()))).toSnapshot()).toEqual(workspace.toSnapshot());
    expect(() => parseWorkspaceSnapshot({ version: 2 })).toThrow();
    const snapshot = workspace.toSnapshot();
    expect(() => parseWorkspaceSnapshot({ ...snapshot, rows: [snapshot.rows[0], snapshot.rows[0]] })).toThrow();
  });

  it("maintains validity against an independent oracle during randomized edits", () => {
    const workspace = createWorkspace();
    let seed = 17;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed; };
    for (let i = 0; i < 2_000; i++) {
      const rows = workspace.store.get(workspace.rows);
      const value = "x".repeat(random() % 9);
      switch (random() % 6) {
        case 0: workspace.actions.addRows(); break;
        case 1: if (rows.length) workspace.actions.removeRow(rows[random() % rows.length]); break;
        case 2: if (rows.length) workspace.store.set(rows[random() % rows.length].level.value, value); break;
        case 3: workspace.actions.broadcastLevel(value); break;
        case 4: workspace.store.set(workspace.baseCode.value, value); break;
        case 5: workspace.store.set(workspace.quoteCode.value, value); break;
      }
      const snapshot = workspace.toSnapshot();
      const expected = Number(snapshot.baseCode.length > 6) + Number(snapshot.quoteCode.length > 6) + snapshot.rows.filter((row) => row.level.length > 3).length;
      expect(workspace.store.get(workspace.errorCount)).toBe(expected);
    }
  });

  it("derives mode choices without synchronization effects", () => {
    const workspace = createWorkspace();
    workspace.store.set(workspace.isInternal, false);
    expect(workspace.store.get(workspace.availableModes)).toEqual(["beta"]);
  });

  it("does not mark newer edits saved when an earlier request resolves", async () => {
    const workspace = createWorkspace();
    workspace.store.set(workspace.baseCode.value, "ONE");
    let resolveSave!: (value: ReturnType<typeof workspace.toSnapshot>) => void;
    const pending = saveWorkspaceDraft(workspace, () => new Promise((resolve) => { resolveSave = resolve; }));
    const submitted = workspace.toSnapshot();
    workspace.store.set(workspace.baseCode.value, "TWO");
    resolveSave(submitted);
    await pending;
    expect(workspace.store.get(workspace.dirty)).toBe(true);
    expect(workspace.toSnapshot().baseCode).toBe("TWO");
    await saveWorkspaceDraft(workspace, async (snapshot) => snapshot);
    expect(workspace.store.get(workspace.dirty)).toBe(false);
  });

  it("preserves draft state on failed saves and blocks invalid submissions", async () => {
    const workspace = createWorkspace();
    workspace.store.set(workspace.baseCode.value, "EDIT");
    await expect(saveWorkspaceDraft(workspace, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(workspace.store.get(workspace.dirty)).toBe(true);
    workspace.store.set(workspace.baseCode.value, "too long");
    const save = vi.fn();
    await expect(saveWorkspaceDraft(workspace, save)).rejects.toThrow("validation");
    expect(save).not.toHaveBeenCalled();
  });

  it("prevents concurrent saves for one workspace and permits retry afterward", async () => {
    const workspace = createWorkspace();
    let resolveSave!: (value: ReturnType<typeof workspace.toSnapshot>) => void;
    const first = saveWorkspaceDraft(workspace, () => new Promise((resolve) => { resolveSave = resolve; }));
    await expect(saveWorkspaceDraft(workspace, async (snapshot) => snapshot)).rejects.toThrow("already in progress");
    resolveSave(workspace.toSnapshot());
    await first;
    await expect(saveWorkspaceDraft(workspace, async (snapshot) => snapshot)).resolves.toEqual(workspace.toSnapshot());
  });

  it("requires deliberate reconciliation of server canonicalization", async () => {
    const workspace = createWorkspace();
    workspace.store.set(workspace.baseCode.value, "local");
    await saveWorkspaceDraft(workspace, async (snapshot) => ({ ...snapshot, baseCode: "LOCAL" }));
    expect(workspace.toSnapshot().baseCode).toBe("local");
    expect(workspace.store.get(workspace.dirty)).toBe(true);
  });
});
