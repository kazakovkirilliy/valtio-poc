import { useStore } from "zustand";
import { hedgeTypesFor, noIssues, parseFieldPath, productFields } from "../domain.ts";
import type { StoreBindings } from "../bindings.ts";
import { createZustandWorkspace } from "./store.ts";

const { workspace, connectStreams } = createZustandWorkspace();
const getDeal = (dealId: string) => workspace.getState().deals[dealId];

export const zustandBindings: StoreBindings = {
  useWorkspace() {
    return {
      dealIds: useStore(workspace, (state) => state.dealIds),
      activeDealId: useStore(workspace, (state) => state.activeDealId),
      streamEnabled: useStore(workspace, (state) => state.streamEnabled),
      actions: workspace.getState().actions,
    };
  },
  useProductIds(dealId) {
    return useStore(getDeal(dealId), (state) => state.productIds);
  },
  useField(dealId, path) {
    const deal = getDeal(dealId);
    const target = parseFieldPath(path);
    // Select stable scalars/issue arrays, never a fresh object in a selector.
    const value = useStore(deal, (state) => target.scope === "deal" ? state[target.field] :
      state.products[target.productId][target.field]);
    const issues = useStore(deal, (state) => target.scope === "deal" ? noIssues :
      state.products[target.productId].validationErrors[target.field]);
    return { value, issues };
  },
  useDealMeta(dealId) {
    const deal = getDeal(dealId);
    const isInternal = useStore(deal, (state) => state.isInternal);
    const hasValidationErrors = useStore(deal, (state) =>
      Object.values(state.products).some((product) =>
        productFields.some((field) => product.validationErrors[field].length > 0)));
    return { isInternal, hedgeTypes: hedgeTypesFor(isInternal), hasValidationErrors };
  },
  getDealActions: (dealId) => getDeal(dealId).getState().actions,
  getSpotPriceStream: (dealId) => getDeal(dealId).getState().spotPriceStream,
  connectStreams,
};
