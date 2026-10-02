import { useSnapshot } from "valtio/react";
import { hedgeTypesFor, noIssues, parseFieldPath, productFields } from "../domain.ts";
import type { StoreBindings } from "../bindings.ts";
import { createValtioWorkspace } from "./store.ts";

const { workspace, connectStreams } = createValtioWorkspace();

export const valtioBindings: StoreBindings = {
  useWorkspace() {
    const snap = useSnapshot(workspace);
    return {
      dealIds: snap.dealIds,
      activeDealId: snap.activeDealId,
      streamEnabled: snap.streamEnabled,
      actions: workspace.actions,
    };
  },
  useProductIds(dealId) {
    return useSnapshot(workspace.deals[dealId]).productIds;
  },
  useField(dealId, path) {
    const snap = useSnapshot(workspace.deals[dealId]);
    const target = parseFieldPath(path);
    return target.scope === "deal" ? { value: snap[target.field], issues: noIssues } : {
      value: snap.products[target.productId][target.field],
      issues: snap.products[target.productId].validationErrors[target.field],
    };
  },
  useDealMeta(dealId) {
    const snap = useSnapshot(workspace.deals[dealId]);
    return {
      isInternal: snap.isInternal,
      hedgeTypes: hedgeTypesFor(snap.isInternal),
      hasValidationErrors: Object.values(snap.products).some((product) =>
        productFields.some((field) => product.validationErrors[field].length > 0)),
    };
  },
  getDealActions: (dealId) => workspace.deals[dealId].actions,
  getSpotPriceStream: (dealId) => workspace.deals[dealId].spotPriceStream,
  connectStreams,
};
