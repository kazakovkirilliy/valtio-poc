import { atom } from "jotai/vanilla";
import { useAtomValue } from "jotai/react";
import { noIssues } from "../../src-shared/domain.ts";
import type { StoreBindings } from "../../src-shared/bindings.ts";
import { createJotaiWorkspace } from "./store.ts";

const workspace = createJotaiWorkspace();
const options = { store: workspace.store };
const emptyUi = atom({ title: "", index: 0 });
const emptyValue = atom("");
const emptyIssues = atom(noIssues);

export const jotaiBindings: StoreBindings = {
  useWorkspace() {
    return {
      dealIds: useAtomValue(workspace.dealIds, options),
      activeDealId: useAtomValue(workspace.activeDealId, options),
      streamEnabled: useAtomValue(workspace.streamEnabled, options), actions: workspace.actions,
    };
  },
  useGroupIds(id) { return useAtomValue(workspace.getDeal(id).groupIds, options); },
  useGroup(id, groupId) {
    const group = workspace.store.get(workspace.getDeal(id).groups)[groupId];
    const ui = useAtomValue(group?.ui ?? emptyUi, options);
    return group ? {
      id: group.id, title: ui.title, groupType: group.groupType,
      products: group.productIds.map((id) => group.products[id].summary),
    } : undefined;
  },
  useField(id, target) {
    const deal = workspace.getDeal(id);
    const product = target.scope === "product" ?
      workspace.store.get(deal.groups)[target.groupId]?.products[target.productId] : undefined;
    const valueAtom = target.scope === "deal" ? deal[target.field] : product?.fields[target.field] ?? emptyValue;
    const issuesAtom = target.scope === "deal" ? emptyIssues : product?.issues[target.field] ?? emptyIssues;
    return { value: useAtomValue(valueAtom, options), issues: useAtomValue(issuesAtom, options) };
  },
  useDealMeta(id) {
    const deal = workspace.getDeal(id);
    return {
      isInternal: useAtomValue(deal.isInternal, options),
      hedgeTypes: useAtomValue(deal.hedgeTypes, options),
      hasValidationErrors: useAtomValue(deal.hasValidationErrors, options),
    };
  },
  getDealActions: workspace.getDealActions,
  getSpotPriceStream: (id) => workspace.getDeal(id).spotPriceStream,
  connectStreams: workspace.connectStreams,
};
