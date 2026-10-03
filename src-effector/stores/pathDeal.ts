import { readDealKey } from "@shared/dealWrites.ts";
import { getValueByPath } from "@shared/lib/path.ts";
import { type PathDeal, createChangeHub } from "@shared/pathDeal.ts";
import { parsePath } from "@shared/paths.ts";
import { noIssues } from "@shared/validation.ts";
import type { DealStore } from "./dealStore.ts";
import type { GroupsState } from "./groupStore.ts";
import { $optionsByKey } from "./optionsStore.ts";

/** The ids whose value is a different object than before: immutable data changed there. */
const changedIds = (previous: Record<string, unknown>, next: Record<string, unknown>) =>
  Object.keys(next).filter((id) => previous[id] !== next[id]);

/**
 * An effector deal as a `PathDeal`. Reads are the stores' current state;
 * writes are one `writePathsAction`. State is immutable, so what changed is
 * found by identity: a product (or its issues) that changed is a new object.
 */
export const createPathDeal = (deal: DealStore): PathDeal => {
  // product id → group id, rebuilt only when the groups change
  let indexed: { groups: GroupsState; groupOf: Map<string, string> } | null = null;
  const groupOf = (productId: string) => {
    const groups = deal.$groups.getState();
    if (indexed?.groups !== groups) {
      const map = new Map<string, string>();
      for (const groupId of groups.order) for (const id of groups.byId[groupId].productIds) map.set(id, groupId);
      indexed = { groups, groupOf: map };
    }
    return indexed.groupOf.get(productId);
  };

  return {
    getGroups: () => {
      const { byId, order } = deal.$groups.getState();
      return order.map((id) => ({ id, title: byId[id].ui.title, productIds: byId[id].productIds }));
    },
    getProduct: (productId) => {
      const product = deal.$products.getState()[productId];
      const groupId = groupOf(productId);
      return product && groupId ? { groupId, title: product.ui.title, data: product.data } : undefined;
    },
    readPath: (path) => {
      const target = parsePath(path);
      if (!target) return undefined;
      if (target.kind === "deal") return readDealKey(target.key, deal.$dealFields.getState(), deal.$settings.getState());
      if (groupOf(target.productId) !== target.groupId) return undefined;
      const product = deal.$products.getState()[target.productId];
      return product && getValueByPath(product.data, target.dataPath);
    },
    writePaths: (writes) => deal.actions.writePathsAction(writes),
    fieldIssues: (productId, fieldId) => deal.$validation.getState()[productId]?.[fieldId] ?? noIssues,
    getSettings: () => deal.$settings.getState(),
    getOptions: () => $optionsByKey.getState(),

    // one set of watchers, however many listeners
    subscribe: createChangeHub((onChange) => {
      let products = deal.$products.getState();
      let validation = deal.$validation.getState();
      const stops = [
        deal.$groups.updates.watch(() => onChange({ kind: "groups" })),
        deal.$products.updates.watch((next) => {
          const ids = changedIds(products, next);
          products = next;
          if (ids.length) onChange({ kind: "products", ids });
        }),
        deal.$validation.updates.watch((next) => {
          const ids = changedIds(validation, next);
          validation = next;
          if (ids.length) onChange({ kind: "products", ids });
        }),
        deal.$dealFields.updates.watch(() => onChange({ kind: "dealFields" })),
        deal.$settings.updates.watch(() => onChange({ kind: "settings" })),
        $optionsByKey.updates.watch(() => onChange({ kind: "options" })),
      ];
      return () => stops.forEach((stop) => stop());
    }),

    addGroup: (groupType) => deal.actions.addGroupAction(groupType),
    cloneGroup: (groupId) => deal.actions.cloneGroupAction(groupId),
    removeGroup: (groupId) => deal.actions.removeGroupAction(groupId),
    spotPriceStream: deal.spotPriceStream,
  };
};
