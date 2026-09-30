import { describe, expect, it, vi } from "vitest";
import { createLiveValue } from "../src/state/liveValue.ts";
import { manualFrames } from "./helpers.ts";

describe("live display channel", () => {
  it("coalesces 10,000 messages into one frame notification", () => {
    const frames = manualFrames();
    const channel = createLiveValue(frames.scheduler);
    const listener = vi.fn();
    const stop = channel.subscribe(listener);
    for (let i = 1; i <= 10_000; i++) channel.publish(i);
    expect(channel.getLatest()).toBe(10_000);
    expect(channel.getSnapshot()).toBe(0);
    expect(frames.size()).toBe(1);
    frames.flush();
    expect(channel.getSnapshot()).toBe(10_000);
    expect(listener).toHaveBeenCalledTimes(1);
    channel.publish(10_000);
    channel.publish(NaN);
    expect(frames.size()).toBe(0);
    stop();
  });

  it("cancels pending work on last unsubscribe and catches up on remount", () => {
    const frames = manualFrames();
    const channel = createLiveValue(frames.scheduler);
    const stop = channel.subscribe(vi.fn());
    channel.publish(1);
    stop();
    expect(frames.size()).toBe(0);
    channel.publish(2);
    expect(frames.size()).toBe(0);
    const listener = vi.fn();
    const stopAgain = channel.subscribe(listener);
    frames.flush();
    expect(channel.getSnapshot()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
    stopAgain();
  });
});
