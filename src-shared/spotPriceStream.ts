type Listener = () => void;

export type SpotPriceStream = {
  getValue(): number;
  subscribe(listener: Listener): () => void;
  start(): void;
  stop(): void;
};

/**
 * Display-only value kept outside every store. Ticks notify only this stream's
 * subscribers, never React or a deal's state subscriptions.
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

/** Only the selected implementation runs timers. Safe to reconnect in StrictMode. */
export function connectSpotPriceStreams(
  getStreams: () => SpotPriceStream[],
  isEnabled: () => boolean,
  subscribeChanges: (listener: () => void) => () => void,
) {
  const connected = new Set<SpotPriceStream>();
  const sync = () => {
    for (const stream of getStreams()) {
      connected.add(stream);
      if (isEnabled()) stream.start();
      else stream.stop();
    }
  };
  const unsubscribe = subscribeChanges(sync);
  sync();
  return () => {
    unsubscribe();
    connected.forEach((stream) => stream.stop());
  };
}
