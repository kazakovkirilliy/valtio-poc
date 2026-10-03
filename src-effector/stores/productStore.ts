import type { DealFieldsState } from "@shared/dealFields.ts";
import { uuid } from "@shared/lib/uuid.ts";
import {
  type AnyProductStore,
  type ProductType,
  type ProductUi,
  definitionOf,
  productTypeOf,
} from "@shared/products/productRegistry.ts";
import { type ProductWrite, planProductWrites } from "@shared/products/productWrites.ts";
import { type FieldIssues, productIssues } from "@shared/validation.ts";

/**
 * Products as plain, immutable data, driven by their declarations
 * (`@shared/products`): nothing here is specific to a product type.
 */

/** A product in the deal's `$products` store: its declared shape, plus an id. */
export type ProductState = AnyProductStore & { id: string };

/**
 * A new product of `productType`, or a copy of `source` (same type). Called
 * when a group is built; the id is new either way.
 */
export const createProduct = (
  productType: ProductType,
  defaults: DealFieldsState,
  ui: ProductUi,
  source?: ProductState,
) =>
  ({
    id: uuid(),
    ui,
    // plain data, so a clone is a deep copy (NaN and all)
    data: source ? structuredClone(source.data) : definitionOf(productType).createData(defaults),
  }) as ProductState;

/**
 * The product with writes applied, by the shared rules: only the objects
 * along the changed paths are copied, and the same product comes back if
 * nothing changed, so nothing bound to it re-renders.
 */
export const withProductWrites = (product: ProductState, writes: readonly ProductWrite[]): ProductState => {
  const { data } = planProductWrites(product.data, writes);
  return data === product.data ? product : ({ ...product, data } as ProductState);
};

/**
 * Issues of every product. Product data is immutable, so results are cached
 * by data identity: only products that actually changed are re-validated.
 */
const issuesCache = new WeakMap<object, FieldIssues>();
export const validateProducts = (
  products: Record<string, ProductState>,
): Record<string, FieldIssues> =>
  Object.fromEntries(
    Object.values(products).map((product) => {
      let issues = issuesCache.get(product.data);
      if (!issues) {
        issues = productIssues(definitionOf(productTypeOf(product.data)), product.data);
        issuesCache.set(product.data, issues);
      }
      return [product.id, issues];
    }),
  );
