import { isCalcReady } from "@shared/calc.ts";
import {
  type ProductData,
  definitionOf,
  productTypeOf,
} from "@shared/products/productRegistry.ts";
import { type FieldIssues, productIssues } from "@shared/validation.ts";
import type { DealState } from "./dealStore.ts";

/**
 * Validation isn't state: a zustand state holds no getters, so issues and
 * readiness are selectors over the deal's data, for components (`useStore`)
 * and for autocalc alike.
 */

const issuesByData = new WeakMap<ProductData, FieldIssues>();

/**
 * A product's issues, per field (fields without any left out). Data is
 * immutable, so each data object is validated once: an edit is a new object,
 * and only the edited product is validated again.
 */
export const issuesOf = (data: ProductData): FieldIssues => {
  let issues = issuesByData.get(data);
  if (!issues) {
    issues = productIssues(definitionOf(productTypeOf(data)), data);
    issuesByData.set(data, issues);
  }
  return issues;
};

export const selectHasValidationErrors = ({ groupIds, groups }: DealState) =>
  groupIds.some((groupId) => {
    const group = groups[groupId];
    return group.productIds.some(
      (productId) => Object.keys(issuesOf(group.products[productId].data)).length > 0,
    );
  });

/** No validation errors and no request pending: ready to calculate. */
export const selectIsReady = (state: DealState, pending: number) =>
  isCalcReady(selectHasValidationErrors(state), pending);
