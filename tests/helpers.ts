import type { FrameScheduler } from "../src/state/liveValue.ts";

export function manualFrames() {
  let sequence = 0;
  const pending = new Map<number, () => void>();
  const scheduler: FrameScheduler = { request: (callback) => { pending.set(++sequence, callback); return sequence; }, cancel: (id) => { pending.delete(id); } };
  return { scheduler, size: () => pending.size, flush: () => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach((callback) => callback()); } };
}
