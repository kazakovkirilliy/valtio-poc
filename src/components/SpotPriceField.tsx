import { memo, useEffect, useId, useRef } from "react";
import { useDealStore } from "../contexts/DealStoreProvider.tsx";

/**
 * Read-only spot price. Ticks are written straight to the DOM node, so the
 * stream never causes a React render — not even of this field.
 */
export const SpotPriceField = memo(() => {
  const id = useId();
  const { spotPriceStream } = useDealStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      spotPriceStream.subscribe(() => {
        if (inputRef.current) {
          inputRef.current.value = String(spotPriceStream.getValue());
        }
      }),
    [spotPriceStream],
  );

  return (
    <div>
      <label htmlFor={id}>Spot Stream</label>
      <input
        ref={inputRef}
        id={id}
        defaultValue={spotPriceStream.getValue()}
        disabled
        readOnly
      />
    </div>
  );
});

SpotPriceField.displayName = "SpotPriceField";
