import { readDealKey } from "@shared/dealWrites.ts";
import { groupTitle } from "@shared/groups.ts";
import { getValueByPath } from "@shared/lib/path.ts";
import { type PathDeal, createChangeHub } from "@shared/pathDeal.ts";
import { parsePath } from "@shared/paths.ts";
import type { DealStore } from "./dealStore.ts";
import { options$ } from "./optionsStore.ts";

/**
 * A Legend-State deal as a `PathDeal`. Reads are the plain state (`peek`);
 * writes are the deal's `writePaths`. One listener on the groups covers every
 * product: Legend-State hands it the path of each leaf that changed, which
 * names the product.
 */
export const createPathDeal = (deal: DealStore): PathDeal => {
  const { deal$ } = deal;

  const findProduct = (productId: string) => {
    const { groupIds, groups } = deal$.peek();
    for (const groupId of groupIds) {
      const product = groups[groupId].products[productId];
      if (product) return { groupId, product };
    }
    return undefined;
  };

  const subscribeToDeal = createChangeHub((emit) => {
    const stops = [
      // titles follow from the order: a new order is new titles
      deal$.groupIds.onChange(() => emit({ kind: "groups" })),
      deal$.groups.onChange(({ changes }) => {
        // paths from the groups: groupId, "products", productId, "data", …
        const ids = new Set<string>();
        for (const { path } of changes) {
          if (path[1] === "products" && path[3] === "data") ids.add(path[2]);
        }
        if (ids.size) emit({ kind: "products", ids: [...ids] });
      }),
      deal$.dealFields.onChange(() => emit({ kind: "dealFields" })),
      deal$.settings.onChange(() => emit({ kind: "settings" })),
      options$.byKey.onChange(() => emit({ kind: "options" })),
    ];
    return () => stops.forEach((stop) => stop());
  });

  return {
    getGroups: () => {
      const { groupIds, groups } = deal$.peek();
      return groupIds.map((id, index) => ({
        id,
        title: groupTitle(groups[id].groupType, index),
        productIds: groups[id].productIds,
      }));
    },
    getProduct: (productId) => {
      const found = findProduct(productId);
      return found && { groupId: found.groupId, title: found.product.ui.title, data: found.product.data };
    },
    readPath: (path) => {
      const target = parsePath(path);
      if (!target) return undefined;
      const { dealFields, settings, groups } = deal$.peek();
      if (target.kind === "deal") return readDealKey(target.key, dealFields, settings);
      const product = groups[target.groupId]?.products[target.productId];
      return product && getValueByPath(product.data, target.dataPath);
    },
    writePaths: (writes) => deal.writePaths(writes),
    fieldIssues: (productId, fieldId) => deal.fieldIssues(productId, fieldId),
    getSettings: () => ({ ...deal$.settings.peek() }),
    getOptions: () => options$.byKey.peek(),
    subscribe: subscribeToDeal,
    addGroup: (groupType) => deal.addNewGroup(groupType),
    cloneGroup: (groupId) => deal.cloneGroup(groupId),
    removeGroup: (groupId) => deal.removeGroup(groupId),
    spotPriceStream: deal.spotPriceStream,
  };
};
