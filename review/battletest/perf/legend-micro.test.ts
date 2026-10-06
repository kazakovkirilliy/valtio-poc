// Is Legend-State's growth the library's (a deleted object key keeps its node) or the app's (computeds never disposed)?
// Mirrors src-legend-state/stores/dealStore.ts: per-product computeds, one computed over all of them, an observer on that.
import { computed, observable, observe } from "@legendapp/state";
import { describe, it } from "vitest";
import { heapMB } from "./harness.ts";

type Variant = "plain" | "per-field-computeds-observed" | "one-computed-per-product-observed" | "per-field-computeds-unobserved" | "fix-observe-and-dispose" | "fix-functions-in-tree";

const PATHS = ["a.b", "a.c", "a.e", "a.f", "d", "g", "h", "i"];

const run = (variant: Variant, cycles: number, root$ = observable<{ ids: string[]; groups: Record<string, { products: Record<string, { data: any }> }> }>({ ids: [], groups: {} })) => {
  const validations = new Map<string, { hasErrors$: { get(): boolean } }>();
  const disposers = new Map<string, () => void>();
  const all$ = computed(() => root$.ids.get().some((id) => validations.get(id)?.hasErrors$.get()));
  const stop = observe(() => {
    all$.get();
  });
  for (let i = 0; i < cycles; i++) {
    const gid = `g${i}`;
    const pid = `p${i}`;
    root$.groups[gid].set({ products: { [pid]: { data: { a: { b: "x", c: "y", e: "x", f: "y" }, d: "z", g: "g", h: "h", i: "i" } } } });
    const data$ = root$.groups[gid].products[pid].data;
    if (variant === "per-field-computeds-observed" || variant === "per-field-computeds-unobserved") {
      const cs = PATHS.map((path) =>
        computed(() => {
          let node: any = data$;
          for (const key of path.split(".")) node = node[key];
          node.get();
          const data = data$.peek();
          return data ? 0 : 0;
        }),
      );
      validations.set(pid, { hasErrors$: computed(() => cs.some((c) => c.get() > 0)) });
    } else if (variant === "fix-observe-and-dispose") {
      // explicit disposal: an observe per field writing into an observable, stopped on removal
      const results$ = observable<Record<string, number>>({});
      const stops = PATHS.map((path, k) =>
        observe(() => {
          let node: any = data$;
          for (const key of path.split(".")) node = node[key];
          node.get();
          const data = data$.peek();
          results$[`f${k}`].set(data ? 0 : 0);
        }),
      );
      validations.set(pid, { hasErrors$: computed(() => PATHS.some((_, k) => (results$[`f${k}`].get() ?? 0) > 0)) });
      disposers.set(pid, () => stops.forEach((stop) => stop()));
    } else if (variant === "fix-functions-in-tree") {
      // computeds as functions inside the tree, beside the data: deleting the group deactivates them
      const fns: Record<string, () => number> = {};
      PATHS.forEach((path, k) => {
        fns[`f${k}`] = () => {
          let node: any = root$.groups[gid].products[pid].data;
          for (const key of path.split(".")) node = node[key];
          node.get();
          return 0;
        };
      });
      root$.groups[gid].products[pid].set({ data: root$.groups[gid].products[pid].data.peek(), ...fns } as any);
      validations.set(pid, {
        hasErrors$: computed(() => PATHS.some((_, k) => ((root$.groups[gid].products[pid] as any)[`f${k}`]?.get() ?? 0) > 0)),
      });
    } else if (variant === "one-computed-per-product-observed") {
      validations.set(pid, {
        hasErrors$: computed(() => {
          const data = data$.get();
          return data ? false : false;
        }),
      });
    }
    if (variant !== "per-field-computeds-unobserved") root$.ids.set((ids) => [...ids, pid]);
    root$.ids.get();
    // remove, like removeGroup
    root$.ids.set((ids) => ids.filter((id) => id !== pid));
    root$.groups[gid].delete();
    validations.delete(pid);
    disposers.get(pid)?.();
    disposers.delete(pid);
  }
  stop();
};

describe("legend micro", () => {
  it.each(["plain", "per-field-computeds-unobserved", "per-field-computeds-observed", "one-computed-per-product-observed", "fix-observe-and-dispose", "fix-functions-in-tree"] as Variant[])("%s", (variant) => {
    const root$ = observable<{ ids: string[]; groups: Record<string, { products: Record<string, { data: any }> }> }>({ ids: [], groups: {} });
    run(variant, 200, root$);
    const before = heapMB();
    run(variant, 3000, root$);
    const after = heapMB();
    console.log(`LEGEND-MICRO ${variant}: +${(after - before).toFixed(2)} MB for 3000 add/delete cycles (${(((after - before) * 1024) / 3000).toFixed(2)} KB/cycle)`);
  });
});
