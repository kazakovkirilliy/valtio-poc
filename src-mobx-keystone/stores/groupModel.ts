import { computed } from "mobx";
import { Model, getParent, idProp, model, prop } from "mobx-keystone";
import type { DealFieldsState } from "@shared/dealFields.ts";
import { type GroupType, groupDefinitions, groupTitle } from "@shared/groups.ts";
import { type Product, newProduct } from "./productModel.ts";

/** A group of products; its type and products are fixed at creation. */
@model("dealEditor/Group")
export class Group extends Model({
  id: idProp,
  groupType: prop<GroupType>(),
  products: prop<Product[]>(),
}) {
  /** From the group's position in the deal: groups are renumbered as they come and go. */
  @computed get title() {
    const index = getParent<Group[]>(this)?.indexOf(this) ?? 0;
    return groupTitle(this.groupType, index);
  }
}

/** A new group with its products, starting from the deal's values. */
export const newGroup = (groupType: GroupType, deal: DealFieldsState) =>
  new Group({
    groupType,
    products: groupDefinitions[groupType].productTypes.map((productType, index) => newProduct(productType, index, deal)),
  });
