import { subscribe } from "valtio";
import { subscribeKey } from "valtio/utils";
import { syncedFieldIds } from "@shared/dealFields.ts";
import { dealSettings } from "@shared/dealSettings.ts";
import { readDealKey } from "@shared/dealWrites.ts";
import type { ProductFieldId } from "@shared/fields.ts";
import { getValueByPath, resolveParent } from "@shared/lib/path.ts";
import { type PathDeal, createChangeHub } from "@shared/pathDeal.ts";
import { parsePath } from "@shared/paths.ts";
import { definitionOfData } from "@shared/products/productWrites.ts";
import { noIssues } from "@shared/validation.ts";
import type { DealStore } from "./dealStore.ts";
import { optionsStore } from "./optionsStore.ts";
import { toValidationKey } from "./validation.ts";

/** A product's validation key for a field path (see `validation.ts`). */
const validationKeyOf = (groupId: string, productId: string, path: string) =>
  toValidationKey(`groups.${groupId}.products.${productId}.data.${path}`);

/**
 * A valtio deal as a `PathDeal`. Reads go straight to the proxies; writes
 * are the deal's `writePaths`. Changes are watched the valtio way, per key:
 * each product field on the nested proxy that owns it, so a write notifies
 * only its own product.
 */
export const createPathDeal = (dealStore: DealStore): PathDeal => {
  const findProduct = (productId: string) => {
    for (const groupId of dealStore.groupIds) {
      const product = dealStore.groups[groupId]?.products[productId];
      if (product) return { groupId, product };
    }
    return undefined;
  };

  const subscribeToDeal = createChangeHub((emit) => {
    // each product field on its own key; validation keys, to compare on change
    const productStops = new Map<string, () => void>();
    const validationKeys = new Map<string, string>(); // key → product id
    const watchProducts = () => {
      const current = new Set<string>();
      for (const groupId of dealStore.groupIds) {
        const group = dealStore.groups[groupId];
        for (const productId of group.productIds) {
          current.add(productId);
          if (productStops.has(productId)) continue;
          const { data } = group.products[productId];
          const stops = Object.values(definitionOfData(data).fieldPaths).map((path) => {
            validationKeys.set(validationKeyOf(groupId, productId, path), productId);
            const { parent, key } = resolveParent(data, path);
            return parent ? subscribeKey(parent, key, () => emit({ kind: "products", ids: [productId] })) : () => {};
          });
          productStops.set(productId, () => stops.forEach((stop) => stop()));
        }
      }
      for (const [productId, stop] of productStops) {
        if (current.has(productId)) continue;
        stop();
        productStops.delete(productId);
        for (const [key, id] of validationKeys) if (id === productId) validationKeys.delete(key);
      }
    };
    watchProducts();

    // one subscription for every product's issues: report the products whose error state flipped
    const hadError = new Map<string, boolean>();
    const stopValidation = subscribe(dealStore.validationErrors, () => {
      const ids = new Set<string>();
      for (const [key, productId] of validationKeys) {
        const hasError = Boolean(dealStore.validationErrors[key]?.length);
        if (hasError !== Boolean(hadError.get(key))) ids.add(productId);
        hadError.set(key, hasError);
      }
      if (ids.size) emit({ kind: "products", ids: [...ids] });
    });

    // groups are added and removed through the order, which re-titles them in the same tick
    const stops = [
      subscribe(dealStore.groupIds, () => {
        watchProducts();
        emit({ kind: "groups" });
      }),
      stopValidation,
      ...syncedFieldIds.map((id) => subscribeKey(dealStore, id, () => emit({ kind: "dealFields" }))),
      ...dealSettings.map(({ id }) => subscribeKey(dealStore, id, () => emit({ kind: "settings" }))),
      subscribe(optionsStore.byKey, () => emit({ kind: "options" })),
    ];
    return () => {
      stops.forEach((stop) => stop());
      productStops.forEach((stop) => stop());
    };
  });

  return {
    getGroups: () =>
      dealStore.groupIds.map((id) => {
        const group = dealStore.groups[id];
        return { id, title: group.ui.title, productIds: group.productIds };
      }),
    getProduct: (productId) => {
      const found = findProduct(productId);
      return found && { groupId: found.groupId, title: found.product.ui.title, data: found.product.data };
    },
    readPath: (path) => {
      const target = parsePath(path);
      if (!target) return undefined;
      if (target.kind === "deal") return readDealKey(target.key, dealStore, dealStore);
      const product = dealStore.groups[target.groupId]?.products[target.productId];
      return product && getValueByPath(product.data, target.dataPath);
    },
    writePaths: (writes) => dealStore.actions.writePaths(writes),
    fieldIssues: (productId, fieldId: ProductFieldId) => {
      const found = findProduct(productId);
      const path = found && definitionOfData(found.product.data).fieldPaths[fieldId];
      return (found && path && dealStore.validationErrors[validationKeyOf(found.groupId, productId, path)]) || noIssues;
    },
    getSettings: () => ({ isInternal: dealStore.isInternal, hedgeType: dealStore.hedgeType }),
    getOptions: () => optionsStore.byKey,
    subscribe: subscribeToDeal,
    addGroup: (groupType) => dealStore.actions.addNewGroup(groupType),
    cloneGroup: (groupId) => dealStore.actions.cloneGroup(groupId),
    removeGroup: (groupId) => dealStore.actions.removeGroup(groupId),
    spotPriceStream: dealStore.spotPriceStream,
  };
};
