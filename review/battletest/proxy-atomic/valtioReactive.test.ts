import { describe, expect, it } from "vitest";

// its own file: valtio-reactive must not have been loaded by another test in this worker
describe("valtio-reactive 0.2.0", () => {
  it("only tracks proxies created after it loads (it patches valtio's internal createHandler)", async () => {
    const { proxy } = await import("valtio");
    const early = proxy({ n: 0 });
    const { effect } = await import("valtio-reactive");
    const late = proxy({ n: 0 });
    const runs = { early: 0, late: 0 };
    const stops = [
      effect(() => {
        void early.n;
        runs.early++;
      }),
      effect(() => {
        void late.n;
        runs.late++;
      }),
    ];
    early.n = 1;
    late.n = 1;
    stops.forEach((stop) => stop());
    console.log("[valtio-reactive] effect runs:", JSON.stringify(runs));
    expect(runs).toEqual({ early: 1, late: 2 }); // the early proxy's change is never seen
  });
});
