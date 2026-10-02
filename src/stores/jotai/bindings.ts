import { useAtomValue } from "jotai/react";
import { parseFieldPath } from "../domain.ts";
import type { StoreBindings } from "../bindings.ts";
import { createJotaiWorkspace } from "./store.ts";

const workspace = createJotaiWorkspace();
const options = { store: workspace.store };

export const jotaiBindings: StoreBindings = {
  useWorkspace() {
    return {
      dealIds: useAtomValue(workspace.dealIds, options),
      activeDealId: useAtomValue(workspace.activeDealId, options),
      streamEnabled: useAtomValue(workspace.streamEnabled, options),
      actions: workspace.actions,
    };
  },
  useProductIds(dealId) {
    return useAtomValue(workspace.getDeal(dealId).productIds, options);
  },
  useField(dealId, path) {
    const deal = workspace.getDeal(dealId);
    const target = parseFieldPath(path);
    const product = target.scope === "product" ?
      workspace.store.get(deal.products)[target.productId] : undefined;
    const valueAtom = target.scope === "deal" ? deal[target.field] : product!.fields[target.field];
    const issuesAtom = target.scope === "deal" ? workspace.dealIssues : product!.issues[target.field];
    return {
      value: useAtomValue(valueAtom, options),
      issues: useAtomValue(issuesAtom, options),
    };
  },
  useDealMeta(dealId) {
    const deal = workspace.getDeal(dealId);
    return {
      isInternal: useAtomValue(deal.isInternal, options),
      hedgeTypes: useAtomValue(deal.hedgeTypes, options),
      hasValidationErrors: useAtomValue(deal.hasValidationErrors, options),
    };
  },
  getDealActions: workspace.getDealActions,
  getSpotPriceStream: (dealId) => workspace.getDeal(dealId).spotPriceStream,
  connectStreams: workspace.connectStreams,
};
