/** Resolves after `ms`. */
export const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fake server latency, so loading and calculating states are visible. The
 * store tests (vitest's "test" mode) get `testMs` instead: they control
 * timing through their own fake API.
 */
export const fakeLatency = (ms: number, testMs = 0) =>
  import.meta.env.MODE === "test" ? testMs : ms;
