import { compareShallow, compareStructural, reaction } from "mobx";
import { readDealKey } from "@shared/dealWrites.ts";
import { getValueByPath } from "@shared/lib/path.ts";
import { type PathDeal, createChangeHub } from "@shared/pathDeal.ts";
import { parsePath } from "@shared/paths.ts";
import { noIssues } from "@shared/validation.ts";
import type { DealStore } from "./dealStore.ts";
import { optionsStore } from "./optionsStore.ts";
import type { Product } from "./productStore.ts";

/**
 * A MobX deal as a `PathDeal`. Reads go through the observables; writes are
 * the deal's `writePaths` action. Each product is watched by its own
 * reaction, which MobX re-runs only when that product's data or issues change.
 */
export const createPathDeal = (deal: DealStore): PathDeal => {
  const findProduct = (productId: string) => {
    for (const groupId of deal.groupIds) {
      const product = deal.groups[groupId]?.products[productId];
      if (product) return { groupId, product };
    }
    return undefined;
  };

  const subscribeToDeal = createChangeHub((emit) => {
    const productStops = new Map<string, () => void>();
    const watchProduct = (product: Product) =>
      reaction(
        // serializing reads, so tracks, every field; plus every field's issues
        () => JSON.stringify([product.data, Object.values(product.fields).map((field) => field.issues.length)]),
        () => emit({ kind: "products", ids: [product.id] }),
      );
    const watchProducts = () => {
      const current = new Set(deal.products.map(({ id }) => id));
      for (const product of deal.products) {
        if (!productStops.has(product.id)) productStops.set(product.id, watchProduct(product));
      }
      for (const [productId, stop] of productStops) {
        if (current.has(productId)) continue;
        stop();
        productStops.delete(productId);
      }
    };
    watchProducts();

    const stops = [
      reaction(
        () => deal.groupIds.map((id) => `${id}:${deal.groups[id].ui.title}`),
        () => {
          watchProducts();
          emit({ kind: "groups" });
        },
        { equals: compareStructural },
      ),
      reaction(
        () => [deal.notionalCcy, deal.premiumCcy, deal.notionalAmount],
        () => emit({ kind: "dealFields" }),
        { equals: compareStructural },
      ),
      reaction(
        () => [deal.isInternal, deal.hedgeType],
        () => emit({ kind: "settings" }),
        { equals: compareStructural },
      ),
      reaction(
        () => Object.values(optionsStore.byKey),
        () => emit({ kind: "options" }),
        { equals: compareShallow },
      ),
    ];
    return () => {
      stops.forEach((stop) => stop());
      productStops.forEach((stop) => stop());
    };
  });

  return {
    getGroups: () =>
      deal.groupIds.map((id) => {
        const group = deal.groups[id];
        return { id, title: group.ui.title, productIds: group.productIds };
      }),
    getProduct: (productId) => {
      const found = findProduct(productId);
      return found && { groupId: found.groupId, title: found.product.ui.title, data: found.product.data };
    },
    readPath: (path) => {
      const target = parsePath(path);
      if (!target) return undefined;
      if (target.kind === "deal") return readDealKey(target.key, deal, deal);
      const product = deal.groups[target.groupId]?.products[target.productId];
      return product && getValueByPath(product.data, target.dataPath);
    },
    writePaths: (writes) => deal.writePaths(writes),
    fieldIssues: (productId, fieldId) => findProduct(productId)?.product.fields[fieldId]?.issues ?? noIssues,
    getSettings: () => ({ isInternal: deal.isInternal, hedgeType: deal.hedgeType }),
    getOptions: () => optionsStore.byKey,
    subscribe: subscribeToDeal,
    addGroup: (groupType) => deal.addNewGroup(groupType),
    cloneGroup: (groupId) => deal.cloneGroup(groupId),
    removeGroup: (groupId) => deal.removeGroup(groupId),
    spotPriceStream: deal.spotPriceStream,
  };
};
