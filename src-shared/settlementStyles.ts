import type { Option } from "./options/optionsSource.ts";

/** The settlement styles a product can have; each loads its own fixing sources. */
export const settlementStyles = ["Cash", "Delivery"] as const;

export type SettlementStyle = (typeof settlementStyles)[number];

export const DEFAULT_SETTLEMENT_STYLE: SettlementStyle = "Delivery";

export const settlementStyleOptions: readonly Option[] = settlementStyles.map(
  (style) => ({ value: style, label: style }),
);
