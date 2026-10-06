import { type Instance, type SnapshotIn, getParent, hasParent, types } from "mobx-state-tree";
import type { DealFieldsState } from "@shared/dealFields.ts";
import { type GroupType, groupDefinitions, groupTitle, groupTypes } from "@shared/groups.ts";
import { uuid } from "@shared/lib/uuid.ts";
import { Product, newProduct } from "./productModel.ts";

/** A group of products; its type and products are fixed at creation. */
export const Group = types
  .model("Group", {
    id: types.optional(types.identifier, uuid),
    groupType: types.enumeration<GroupType>("GroupType", groupTypes),
    products: types.array(Product),
  })
  .views((self) => ({
    /** From the group's position in the deal: groups are renumbered as they come and go. */
    get title() {
      const index = hasParent(self) ? getParent<Group[]>(self).indexOf(self as Group) : 0;
      return groupTitle(self.groupType, index);
    },
  }));

export type Group = Instance<typeof Group>;

/** A new group with its products, starting from the deal's values. */
export const newGroup = (groupType: GroupType, deal: DealFieldsState): SnapshotIn<typeof Group> => ({
  groupType,
  products: groupDefinitions[groupType].productTypes.map((productType, index) => newProduct(productType, index, deal)),
});

/** A copy of a group: new ids, the same data (immutable, so safely shared). */
export const copyOfGroup = (group: Group): SnapshotIn<typeof Group> => ({
  groupType: group.groupType,
  products: group.products.map(({ title, data }) => ({ title, data })),
});
