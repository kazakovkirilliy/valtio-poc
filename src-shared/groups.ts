import {
  type ProductType,
  type ProductUi,
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

/** A group's title from its position in the deal. */
export const groupTitle = (groupType: GroupType, index: number) =>
  `${groupDefinitions[groupType].label} #${index + 1}`;

/** A product's title and index within its group. */
export const productUi = (productType: ProductType, index: number): ProductUi => ({
  title: `${productDefinitions[productType].label} #${index + 1}`,
  index,
});
