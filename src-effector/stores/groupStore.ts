import { uuid } from "../lib/uuid.ts";
import type { ProductDefaults } from "./dealFields.ts";
import {
  type ProductState,
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

export type GroupState = {
  id: string;
  groupType: GroupType;
  ui: { title: string; index: number }; // derived from the position in `order`
  productIds: string[]; // display order; each product's `ui.index` mirrors it
};

/** The deal's groups: keyed by id, plus their display order. */
export type GroupsState = {
  byId: Record<string, GroupState>;
  order: string[];
};

export type CreatedGroup = {
  group: GroupState;
  products: ProductState[];
  position: number;
};

/**
 * Builds a group and its products, with new ids. `sourceProducts` (a group
 * to clone) are copied by position. Products are numbered within the group.
 */
const buildGroup = (
  groupType: GroupType,
  defaults: ProductDefaults,
  position: number,
  sourceProducts?: ProductState[],
): CreatedGroup => {
  const products = groupDefinitions[groupType].productTypes.map(
    (productType, index) =>
      createProduct(
        productType,
        defaults,
        { title: `${productDefinitions[productType].label} #${index + 1}`, index },
        sourceProducts?.[index],
      ),
  );
  return {
    group: {
      id: uuid(),
      groupType,
      ui: { title: "", index: 0 }, // set by reindexGroupsReducer
      productIds: products.map((product) => product.id),
    },
    products,
    position,
  };
};

/** `addGroupAction`: a new group of `groupType`, placed last. */
export const addGroupReducer = (
  { defaults, groups }: { defaults: ProductDefaults; groups: GroupsState },
  groupType: GroupType,
): CreatedGroup => buildGroup(groupType, defaults, groups.order.length);

/**
 * `cloneGroupAction`: a copy of the group and its products, placed right
 * after the original.
 */
export const cloneGroupReducer = (
  {
    defaults,
    groups,
    products,
  }: {
    defaults: ProductDefaults;
    groups: GroupsState;
    products: Record<string, ProductState>;
  },
  groupId: string,
): CreatedGroup => {
  const source = groups.byId[groupId];
  return buildGroup(
    source.groupType,
    defaults,
    groups.order.indexOf(groupId) + 1,
    source.productIds.map((productId) => products[productId]),
  );
};

/**
 * Re-derives every group's index and title from its position. Groups whose
 * position did not change keep their identity, so their columns don't
 * re-render.
 */
const reindexGroupsReducer = ({ byId, order }: GroupsState): GroupsState => {
  const next: Record<string, GroupState> = {};
  order.forEach((groupId, index) => {
    const group = byId[groupId];
    const title = `${groupDefinitions[group.groupType].label} #${index + 1}`;
    next[groupId] =
      group.ui.index === index && group.ui.title === title
        ? group
        : { ...group, ui: { index, title } };
  });
  return { byId: next, order };
};

/** `groupCreated`: the groups with the new group inserted at its position. */
export const groupCreatedReducer = (
  groups: GroupsState,
  { group, position }: CreatedGroup,
): GroupsState => {
  const order = [...groups.order];
  order.splice(position, 0, group.id);
  return reindexGroupsReducer({
    byId: { ...groups.byId, [group.id]: group },
    order,
  });
};

/** `groupRemoved`: the groups without the removed group. */
export const groupRemovedReducer = (
  groups: GroupsState,
  removed: GroupState,
): GroupsState => {
  const { [removed.id]: _removed, ...byId } = groups.byId;
  void _removed;
  return reindexGroupsReducer({
    byId,
    order: groups.order.filter((id) => id !== removed.id),
  });
};
