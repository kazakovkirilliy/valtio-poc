import {
  type DealFieldsState,
  type SyncedFieldId,
  isBroadcastField,
  isEmptyBroadcast,
  isSyncedField,
} from "./dealFields.ts";
import { type DealSettingsState, isDealSetting, withSetting } from "./dealSettings.ts";
import type { ProductFieldId } from "./fields.ts";
import { type PathWrite, parsePath } from "./paths.ts";
import type { ProductData } from "./products/productRegistry.ts";
import {
  type OptionsRequest,
  type ProductWrite,
  definitionOfData,
  fieldAtPath,
  optionsRequestsFor,
  uniqueRequests,
} from "./products/productWrites.ts";

/** A product as the router sees it: where it lives, and its data now. */
export type DealProduct = { groupId: string; productId: string; data: ProductData };

/** A batch of path writes, sorted out: what each part of the deal gets. */
export type RoutedWrites = {
  dealFields: DealFieldsState;
  settings: DealSettingsState;
  /** Each addressed product's writes, in order, by product id. */
  products: Map<string, { groupId: string; writes: ProductWrite[] }>;
  /** The options to (re)load after it. */
  requests: OptionsRequest[];
};

const withDealField = (deal: DealFieldsState, fieldId: SyncedFieldId, value: unknown) =>
  Object.is(deal[fieldId], value) ? deal : { ...deal, [fieldId]: value };

/**
 * Routes a batch of path writes (see `paths.ts`), in order, for any store:
 * - a deal setting: the new settings (a hedge type stays one of its options);
 * - a synced field, from the deal or any product: the deal's value, and
 *   every product (two-way sync);
 * - a deal broadcast: every product (an empty one goes nowhere);
 * - any other product path: that product.
 * Paths the deal doesn't have are ignored. Each store then applies the
 * result its own way — that, and how it notices, is all that differs.
 */
export const routeWrites = (
  state: { dealFields: DealFieldsState; settings: DealSettingsState; products: readonly DealProduct[] },
  writes: readonly PathWrite[],
): RoutedWrites => {
  let { dealFields, settings } = state;
  const products = new Map<string, { groupId: string; writes: ProductWrite[] }>();
  const requests: OptionsRequest[] = [];
  const toProduct = (groupId: string, productId: string, write: ProductWrite) => {
    if (!products.has(productId)) products.set(productId, { groupId, writes: [] });
    products.get(productId)!.writes.push(write);
  };
  const toEvery = (fieldId: ProductFieldId, value: unknown) => {
    for (const { groupId, productId } of state.products) toProduct(groupId, productId, { fieldId, value });
    requests.push(...optionsRequestsFor(fieldId, value));
  };

  for (const { path, value } of writes) {
    const target = parsePath(path);
    if (!target) continue;
    if (target.kind === "deal") {
      const { key } = target;
      if (isDealSetting(key)) settings = withSetting(settings, key, value);
      else if (isSyncedField(key)) {
        dealFields = withDealField(dealFields, key, value);
        toEvery(key, value);
      } else if (isBroadcastField(key) && !isEmptyBroadcast(value)) toEvery(key, value);
      continue;
    }
    const product = state.products.find(
      ({ groupId, productId }) => groupId === target.groupId && productId === target.productId,
    );
    if (!product) continue;
    const fieldId = fieldAtPath(definitionOfData(product.data), target.dataPath);
    if (fieldId && isSyncedField(fieldId)) {
      // a product's synced field is the two-way sync: the deal and every product
      dealFields = withDealField(dealFields, fieldId, value);
      toEvery(fieldId, value);
    } else {
      toProduct(product.groupId, product.productId, { path: target.dataPath, value });
      if (fieldId) requests.push(...optionsRequestsFor(fieldId, value));
    }
  }
  return { dealFields, settings, products, requests: uniqueRequests(requests) };
};

/** A deal path's value, from the deal's own state (`undefined` for a broadcast: the deal holds nothing). */
export const readDealKey = (key: string, dealFields: DealFieldsState, settings: DealSettingsState): unknown => {
  if (isDealSetting(key)) return settings[key];
  return isSyncedField(key) ? dealFields[key] : undefined;
};
