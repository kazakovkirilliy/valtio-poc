import { useStore } from "zustand";
import { hedgeTypesFor, noIssues, productFieldIds, readProductField } from "../../src-shared/domain.ts";
import type { StoreBindings } from "../../src-shared/bindings.ts";
import { createZustandWorkspace } from "./store.ts";

const { workspace, connectStreams } = createZustandWorkspace();
const getDeal = (id: string) => workspace.getState().deals[id];

export const zustandBindings: StoreBindings = {
  useWorkspace() {
    return {
      dealIds: useStore(workspace, (state) => state.dealIds),
      activeDealId: useStore(workspace, (state) => state.activeDealId),
      streamEnabled: useStore(workspace, (state) => state.streamEnabled),
      actions: workspace.getState().actions,
    };
  },
  useGroupIds(id) { return useStore(getDeal(id), (state) => state.groupIds); },
  useGroup(id, groupId) {
    const deal = getDeal(id);
    const group = useStore(deal, (state) => state.groups[groupId]);
    return group ? {
      id: group.id, title: group.ui.title, groupType: group.groupType,
      products: group.productIds.map((id) => {
        const product = deal.getState().products[id];
        return { id, title: product.ui.title, productType: product.data.productType };
      }),
    } : undefined;
  },
  useField(id, target) {
    const deal = getDeal(id);
    const value = useStore(deal, (state) => {
      if (target.scope === "deal") return state[target.field];
      const product = state.products[target.productId];
      return product ? readProductField(product.data, target.field) : "";
    });
    const issues = useStore(deal, (state) => target.scope === "deal" ? noIssues :
      state.products[target.productId]?.validationErrors[target.field] ?? noIssues);
    return { value, issues };
  },
  useDealMeta(id) {
    const deal = getDeal(id);
    const isInternal = useStore(deal, (state) => state.isInternal);
    const hasValidationErrors = useStore(deal, (state) => Object.values(state.products).some((product) =>
      productFieldIds.some((field) => product.validationErrors[field].length > 0)));
    return { isInternal, hedgeTypes: hedgeTypesFor(isInternal), hasValidationErrors };
  },
  getDealActions: (id) => getDeal(id).getState().actions,
  getSpotPriceStream: (id) => getDeal(id).getState().spotPriceStream,
  connectStreams,
};
