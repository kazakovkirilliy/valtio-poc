type Listener = () => void;

export type SpotPriceStream = {
  getValue(): number;
  subscribe(listener: Listener): () => void;
  start(): void;
  stop(): void;
};

/**
 * High-frequency, display-only value kept outside valtio: a tick notifies only
 * its own subscribers, never the deal proxy's (snapshots, effects, devtools).
 */
export const createSpotPriceStream = (): SpotPriceStream => {
  let value = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<Listener>();

  return {
    getValue: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (timer) return;
      timer = setInterval(() => {
        value += 1;
        listeners.forEach((listener) => listener());
      }, 500);
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
  };
};
