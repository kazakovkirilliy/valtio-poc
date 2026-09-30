import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(cleanup);

// Layout-only browser APIs; state, React, and the virtualizer run unmocked.
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return this.classList.contains("row-scroll") ? 500 : 114; } });
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1_000 });
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
