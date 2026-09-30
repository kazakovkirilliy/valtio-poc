import { useEffect, useState, useSyncExternalStore } from "react";
import type { LiveSource, LiveValue } from "../state/liveValue.ts";

export function LiveValueField({ channel, source, enabled, label = "Live value" }: { channel: LiveValue; source: LiveSource; enabled: boolean; label?: string }) {
  const value = useSyncExternalStore(channel.subscribe, channel.getSnapshot, channel.getServerSnapshot);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let failed = true;
    const stop = source(
      (next) => {
        if (!active) return;
        if (failed) { failed = false; setError(null); }
        channel.publish(next);
      },
      (nextError) => { if (active) { failed = true; setError(nextError); } },
    );
    return () => { active = false; stop(); };
  }, [channel, source, enabled]);
  return (
    <div className="live-value">
      <span>{label}</span>
      <output aria-label={label} aria-live="off">{value.toLocaleString()}</output>
      <small>{!enabled ? "Paused" : error ? "Connection error" : "Connected"}</small>
    </div>
  );
}
