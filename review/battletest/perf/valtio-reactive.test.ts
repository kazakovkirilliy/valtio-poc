// valtio-reactive replaces valtio's internal createHandler: every proxy created after it loads gets a JS `get` trap.
// Property reads through a proxy made before vs after the import (same shape, same reads).
import { describe, expect, it } from "vitest";
import { proxy } from "valtio";
import { median } from "./harness.ts";

const shape = () => ({ groups: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`g${i}`, { products: { p: { data: { a: { b: { c: i } } } } } }])) });
const reads = (p: ReturnType<typeof shape>, rounds: number) => {
  let sum = 0;
  for (let r = 0; r < rounds; r++) for (let i = 0; i < 100; i++) sum += p.groups[`g${i}`].products.p.data.a.b.c;
  return sum;
};
const time = (p: ReturnType<typeof shape>) => {
  reads(p, 2000);
  const xs: number[] = [];
  for (let k = 0; k < 7; k++) {
    const t = performance.now();
    reads(p, 5000);
    xs.push(performance.now() - t);
  }
  return median(xs);
};

describe("valtio-reactive trap", () => {
  it("reads through a proxy before and after valtio-reactive is loaded", async () => {
    const before = proxy(shape());
    const msBefore = time(before);
    await import("valtio-reactive");
    const after = proxy(shape());
    const msAfter = time(after);
    const plain = shape();
    const msPlain = time(plain);
    const reads8 = 5000 * 100 * 8;
    console.log(`VALTIO-REACTIVE reads (${reads8 / 1e6}M property gets): plain object ${msPlain.toFixed(1)} ms, valtio proxy ${msBefore.toFixed(1)} ms, valtio proxy created after valtio-reactive loaded ${msAfter.toFixed(1)} ms (x${(msAfter / msBefore).toFixed(2)})`);
    expect(msAfter).toBeGreaterThan(0);
  });
});
