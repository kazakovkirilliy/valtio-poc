import { memo, useEffect, useRef } from "react";
import { useDealId, useStoreBindings } from "../StoreProvider.tsx";

export const SpotPriceField = memo(() => {
  const bindings = useStoreBindings();
  const stream = bindings.getSpotPriceStream(useDealId());
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const update = () => { if (input.current) input.current.value = String(stream.getValue()); };
    update();
    return stream.subscribe(update);
  }, [stream]);
  return <input ref={input} className="input" type="number" aria-label="Spot Stream"
    defaultValue={stream.getValue()} readOnly />;
});
SpotPriceField.displayName = "SpotPriceField";
