import { proxy } from "valtio";
import { deepClone } from "valtio/utils";
import { type DealStore } from "./dealStore.ts";
import {
  type AnyProductStore,
  type ProductType,
  createProduct,
  productTypeLabels,
} from "./productRegistry.ts";
import { uuid } from "../utils/utils.ts";

/**
 * Every group type and the products it holds. A group's type and products
 * are fixed at creation; clone/remove act on whole groups only.
 */
export const groupDefinitions = {
  VanillaGroup: { label: "Vanilla Group", productTypes: ["VanillaProduct"] },
  Strategy: {
    label: "Strategy",
    productTypes: ["VanillaProduct", "VanillaProduct"],
  },
  Average: { label: "Average", productTypes: ["AverageProduct"] },
} as const satisfies Record<
  string,
  { label: string; productTypes: readonly ProductType[] }
>;

export type GroupType = keyof typeof groupDefinitions;

export const groupTypes = Object.keys(groupDefinitions) as GroupType[];

export type GroupStore = {
  id: string;
  ui: {
    title: string;
    index: number;
  };
  groupType: GroupType;
  products: Record<string, AnyProductStore>;
  productIds: string[]; // display order; each product's `ui.index` mirrors it
};

/**
 * Group factory. `source` (a group to clone) seeds each product with a plain
 * copy of the product at the same position. Products are numbered within
 * the group, once, since a group's products never change.
 */
export const createGroupStore = (
  $dealStore: DealStore,
  groupType: GroupType,
  source?: GroupStore,
) => {
  const groupId = uuid();
  const groupStore = proxy<GroupStore>({
    id: groupId,
    ui: { title: "", index: 0 }, // set by the deal on insert
    groupType,
    products: {},
    productIds: [],
  });

  const disposers: Array<() => void> = [];

  groupDefinitions[groupType].productTypes.forEach((productType, index) => {
    const productId = uuid();
    const sourceProduct = source?.products[source.productIds[index]];
    const { productStore, dispose } = createProduct(
      productType,
      $dealStore,
      `groups.${groupId}.products.${productId}`,
      sourceProduct && deepClone(sourceProduct),
    );
    productStore.ui.index = index;
    productStore.ui.title = `${productTypeLabels[productType]} #${index + 1}`;

    groupStore.products[productId] = productStore;
    groupStore.productIds.push(productId);
    disposers.push(dispose);
  });

  return {
    groupStore,
    /** Drops every product's subscriptions; call when the group is removed. */
    dispose: () => disposers.forEach((dispose) => dispose()),
  };
};
