import { memo } from "react";
import type { CalcState } from "../calc.ts";

type Props = {
  calc: CalcState;
  /** No validation errors and no request pending. */
  isReady: boolean;
  isAutocalcEnabled: boolean;
  onToggleAutocalc: () => void;
  onCalculate: () => void;
};

const formatPrice = (price: number | null) => (price === null ? "—" : price.toFixed(2));

const priceText = ({ status, price }: CalcState) => {
  switch (status) {
    case "none":
      return "—";
    case "calculating":
      return "Calculating…";
    case "done":
      return formatPrice(price);
    case "outdated":
      return price === null ? "Outdated" : `${formatPrice(price)} (outdated)`;
    case "error":
      return "Calculation failed";
  }
};

/** The deal's price, the persisted autocalc switch and the manual Calculate button. */
export const CalcBar = memo(
  ({ calc, isReady, isAutocalcEnabled, onToggleAutocalc, onCalculate }: Props) => (
    <div className="deal__calc">
      <label className="deal__autocalc">
        <input
          type="checkbox"
          role="switch"
          checked={isAutocalcEnabled}
          onChange={onToggleAutocalc}
        />
        Autocalc
      </label>
      <button
        className="button"
        disabled={!isReady || calc.status === "calculating"}
        onClick={onCalculate}
      >
        Calculate
      </button>
      <span>
        Price: <output aria-label="Price">{priceText(calc)}</output>
      </span>
      {!isReady && (
        <span className="deal__calc-hint">
          Waiting for valid fields and pending requests
        </span>
      )}
    </div>
  ),
);

CalcBar.displayName = "CalcBar";
