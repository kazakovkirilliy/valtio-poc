import { makeAutoObservable } from "mobx";
import type { OptionProduct, ProductOwner } from "../products/optionProduct.ts";
import {
  type ProductType,
  createProduct,
  productDefinitions,
} from "../products/productRegistry.ts";
import { uuid } from "../lib/uuid.ts";

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

export class GroupStore {
  readonly id = uuid();
  readonly groupType: GroupType;
  ui = { title: "", index: 0 }; // set by the deal on insert
  products: Record<string, OptionProduct> = {};
  productIds: string[] = []; // display order; each product's `ui.index` mirrors it

  /**
   * `source` (a group to clone) seeds each product with a copy of the
   * product at the same position. Products are numbered within the group,
   * once, since a group's products never change.
   */
  constructor(groupType: GroupType, owner: ProductOwner, source?: GroupStore) {
    this.groupType = groupType;

    groupDefinitions[groupType].productTypes.forEach((productType, index) => {
      const product = createProduct(
        productType,
        owner,
        { title: `${productDefinitions[productType].label} #${index + 1}`, index },
        source?.products[source.productIds[index]],
      );
      this.products[product.id] = product;
      this.productIds.push(product.id);
    });

    makeAutoObservable(this, { id: false, groupType: false }, { autoBind: true });
  }

  get productList(): OptionProduct[] {
    return this.productIds.map((productId) => this.products[productId]);
  }
}
