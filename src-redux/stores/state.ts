import { type CalcState, initialCalcState } from "@shared/calc.ts";
import { type DealFieldsState, initialDealFields } from "@shared/dealFields.ts";
import { type DealSettingsState, initialDealSettings } from "@shared/dealSettings.ts";
import type { GroupType } from "@shared/groups.ts";
import type { ProductData, ProductUi } from "@shared/products/productRegistry.ts";

/**
 * A deal's state: plain, immutable data. Group titles aren't kept: they
 * follow from `groupIds` (see `pathDeal.ts`); issues aren't either: they
 * follow from each product's data (see `selectors.ts`).
 */
export type ProductState = { id: string; ui: ProductUi; data: ProductData };
export type GroupState = {
  id: string;
  groupType: GroupType;
  productIds: string[]; // display order
  products: Record<string, ProductState>;
};
export type DealState = {
  dealFields: DealFieldsState;
  settings: DealSettingsState;
  groupIds: string[]; // display order
  groups: Record<string, GroupState>;
  calc: CalcState;
};

/** A new deal's state, with its own copies of the shared defaults (the store freezes what it holds). */
export const initialDealState = (): DealState => ({
  dealFields: { ...initialDealFields },
  settings: { ...initialDealSettings },
  groupIds: [],
  groups: {},
  calc: { ...initialCalcState },
});
