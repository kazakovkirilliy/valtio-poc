export type FrameScheduler = {
  request(callback: () => void): number;
  cancel(handle: number): void;
};
export type LiveSource = (next: (value: number) => void, error: (error: Error) => void) => () => void;

const browserFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** Latest-value display channel. Never use a coalesced display as an event log. */
export function createLiveValue(scheduler: FrameScheduler = browserFrames) {
  let latest = 0;
  let displayed = 0;
  let frame: number | undefined;
  const listeners = new Set<() => void>();

  function schedule() {
    if (frame !== undefined || !listeners.size || Object.is(latest, displayed)) return;
    frame = scheduler.request(() => {
      frame = undefined;
      if (Object.is(latest, displayed)) return;
      displayed = latest;
      listeners.forEach((listener) => listener());
    });
  }

  return {
    getSnapshot: () => displayed,
    getServerSnapshot: () => 0,
    getLatest: () => latest,
    publish(value: number) {
      if (!Number.isFinite(value)) return;
      latest = value;
      schedule();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      schedule();
      return () => {
        listeners.delete(listener);
        if (!listeners.size && frame !== undefined) {
          scheduler.cancel(frame);
          frame = undefined;
        }
      };
    },
  };
}

export type LiveValue = ReturnType<typeof createLiveValue>;

export const demoSource: LiveSource = (next) => {
  let value = 0;
  const timer = setInterval(() => next(++value), 5);
  return () => clearInterval(timer);
};
