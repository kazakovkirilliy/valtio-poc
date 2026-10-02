import { observable } from "mobx";
import { uuid } from "../lib/uuid.ts";
import type { ProductOwner } from "./dealFields.ts";
import {
  type AnyProduct,
  type ProductType,
  createProduct,
  productDefinitions,
} from "./products/productRegistry.ts";

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
  readonly id: string;
  readonly groupType: GroupType;
  ui: { title: string; index: number }; // set by the deal on insert
  products: Record<string, AnyProduct>;
  productIds: string[]; // display order; each product's `ui.index` mirrors it
  readonly productList: AnyProduct[];
};

/**
 * Group factory. `source` (a group to clone) seeds each product with a copy
 * of the product at the same position. Products are numbered within the
 * group, once, since a group's products never change.
 */
export const createGroupStore = (
  groupType: GroupType,
  owner: ProductOwner,
  source?: GroupStore,
): GroupStore => {
  const products: Record<string, AnyProduct> = {};
  const productIds: string[] = [];

  groupDefinitions[groupType].productTypes.forEach((productType, index) => {
    const product = createProduct(
      productType,
      owner,
      { title: `${productDefinitions[productType].label} #${index + 1}`, index },
      source?.products[source.productIds[index]],
    );
    products[product.id] = product;
    productIds.push(product.id);
  });

  const group: GroupStore = observable<GroupStore>(
    {
      id: uuid(),
      groupType,
      ui: { title: "", index: 0 },
      products,
      productIds,
      get productList() {
        return group.productIds.map((productId) => group.products[productId]);
      },
    },
    { id: false, groupType: false },
  );

  return group;
};
