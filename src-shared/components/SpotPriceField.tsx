import { memo, useEffect, useRef } from "react";
import { fieldLabels } from "../fields.ts";
import type { SpotPriceStream } from "../spotPriceStream.ts";

/**
 * Read-only spot price. Ticks are written straight to the DOM node, so the
 * stream never causes a React render — not even of this field.
 */
export const SpotPriceField = memo(
  ({ spotPriceStream }: { spotPriceStream: SpotPriceStream }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      spotPriceStream.subscribe(() => {
        if (inputRef.current) {
          inputRef.current.value = spotPriceStream.getValue().toString();
        }
      }),
    [spotPriceStream],
  );

  return (
    <input
      ref={inputRef}
      className="input"
      aria-label={fieldLabels.spotStream}
      defaultValue={spotPriceStream.getValue()}
      disabled
      readOnly
    />
  );
  },
);

SpotPriceField.displayName = "SpotPriceField";
