import type { DealFieldsState } from "@shared/dealFields.ts";
import { type GroupType, groupDefinitions, productUi } from "@shared/groups.ts";
import { uuid } from "@shared/lib/uuid.ts";
import type { AnyProductStore } from "@shared/products/productRegistry.ts";
import { createProductStore } from "./productStore.ts";

export type GroupStore = {
  id: string;
  ui: { title: string; index: number }; // set by the deal on insert
  groupType: GroupType;
  products: Record<string, AnyProductStore>;
  productIds: string[]; // display order; each product's `ui.index` mirrors it
};

/**
 * Group factory: plain data, held by its deal's store (one store per deal).
 * `source` (a group to clone) gives each product the data of the product at
 * the same position. Products are numbered within the group, once, since a
 * group's products never change.
 */
export const createGroupStore = (
  dealFields: DealFieldsState,
  groupType: GroupType,
  source?: GroupStore,
): GroupStore => {
  const products: Record<string, AnyProductStore> = {};
  const productIds = groupDefinitions[groupType].productTypes.map((productType, index) => {
    const productId = uuid();
    const sourceProduct = source?.products[source.productIds[index]];
    products[productId] = createProductStore(
      dealFields,
      productType,
      productUi(productType, index),
      sourceProduct?.data,
    );
    return productId;
  });

  return {
    id: uuid(),
    ui: { title: "", index: 0 },
    groupType,
    products,
    productIds,
  };
};
