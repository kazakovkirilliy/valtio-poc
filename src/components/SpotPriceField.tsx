import { memo, useEffect, useId, useRef } from "react";
import { useDealId, useStoreBindings } from "../contexts/StoreProvider.tsx";

/**
 * Read-only spot price. Ticks are written straight to the DOM node, so the
 * stream never causes a React render — not even of this field.
 */
export const SpotPriceField = memo(() => {
  const id = useId();
  const bindings = useStoreBindings();
  const spotPriceStream = bindings.getSpotPriceStream(useDealId());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => {
        if (inputRef.current) {
          inputRef.current.value = spotPriceStream.getValue().toString();
        }
    };
    update();
    return spotPriceStream.subscribe(update);
  }, [spotPriceStream]);

  return (
    <div className="field">
      <label htmlFor={id}>Spot Stream</label>
      <input
        ref={inputRef}
        id={id}
        defaultValue={spotPriceStream.getValue()}
        readOnly
        aria-describedby={`${id}-hint`}
      />
      <small id={`${id}-hint`}>Ticks every 500 ms. Zero React commits.</small>
    </div>
  );
});

SpotPriceField.displayName = "SpotPriceField";
