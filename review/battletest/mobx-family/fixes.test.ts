import { describe, expect, it } from "vitest";

/**
 * Proof of concept for the suggested fixes (no app code changed): the
 * idiomatic tools each library has for the NaN/JSON time-travel problem.
 */
describe("mobx-state-tree: types.snapshotProcessor revives NaN from JSON", () => {
  it("a number that is NaN while empty survives a JSON round trip", async () => {
    const { applySnapshot, getSnapshot, types } = await import("mobx-state-tree");
    const emptyableNumber = types.snapshotProcessor(types.number, {
      preProcessor: (snapshot: number | null) => (snapshot === null ? NaN : snapshot),
    });
    /** Every null leaf back to NaN (nothing in the app's data is null). */
    const reviveNaN = (value: unknown): unknown =>
      value === null
        ? NaN
        : typeof value === "object"
          ? Object.fromEntries(Object.entries(value as object).map(([key, leaf]) => [key, reviveNaN(leaf)]))
          : value;
    const Model = types.model({
      amount: types.optional(emptyableNumber, NaN),
      data: types.snapshotProcessor(types.frozen<{ nested: { n: number } }>(), {
        preProcessor: (snapshot) => reviveNaN(snapshot) as { nested: { n: number } },
      }),
    });
    const node = Model.create({ data: { nested: { n: NaN } } });
    applySnapshot(node, JSON.parse(JSON.stringify(getSnapshot(node))));
    expect(node.amount).toBeNaN();
    expect(node.data.nested.n).toBeNaN();
  });
});

describe("mobx: a structural per-product snapshot instead of JSON.stringify", () => {
  it("a computedStruct over toJS changes identity only when the product changed", async () => {
    const { autorun, computed, compareStructural, observable, runInAction, toJS } = await import("mobx");
    const products = [observable({ a: { b: 1 } }), observable({ a: { b: 2 } })];
    const snapshots = products.map((data) => computed(() => toJS(data), { equals: compareStructural }));
    const seen: unknown[][] = [];
    const stop = autorun(() => void seen.push(snapshots.map((snapshot) => snapshot.get())));
    runInAction(() => (products[0].a.b = 5));
    runInAction(() => (products[0].a.b = 5)); // no change
    expect(seen).toHaveLength(2);
    expect(seen[1][1]).toBe(seen[0][1]); // the untouched product kept its snapshot
    expect(seen[1][0]).not.toBe(seen[0][0]);
    stop();
  });
});
