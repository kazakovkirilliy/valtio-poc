import { createEvent, createStore, merge, sample, type Store } from "effector";
import {
  type BroadcastFieldId,
  type DealFieldsState,
  type SyncedFieldId,
  isSyncedField,
} from "./dealFields.ts";
import type { ProductFieldId } from "./fields.ts";
import {
  type GroupType,
  type GroupsState,
  createGroup,
  insertGroup,
  removeGroup,
} from "./groupStore.ts";
import {
  type ProductState,
  setProductField,
  validateProducts,
} from "./products/productRegistry.ts";
import { createSpotPriceStream } from "./spotPriceStream.ts";

/** What a deal needs from the app-wide developer settings. */
type DealDevtools = { $isSpotPriceStreamEnabled: Store<boolean> };

const mapProducts = (
  products: Record<string, ProductState>,
  update: (product: ProductState) => ProductState,
) => {
  let changed = false;
  const next: Record<string, ProductState> = {};
  for (const [id, product] of Object.entries(products)) {
    next[id] = update(product);
    changed ||= next[id] !== product;
  }
  return changed ? next : products; // same object: no update, no re-render
};

/**
 * One deal's model. State lives in stores keyed by id; every change is an
 * event handled by pure reducers, and derived state (validation, order) is
 * computed from the stores. Products are plain data, written through their
 * own module's `setField`, so a product that didn't change keeps its
 * identity and nothing bound to it re-renders.
 */
export const createDealStore = (devtools: DealDevtools) => {
  // --- events: what the UI (or anything else) can ask for
  const addGroup = createEvent<GroupType>();
  const cloneGroup = createEvent<string>();
  const removeGroupById = createEvent<string>();
  /** A product's own field was committed. */
  const productFieldCommitted = createEvent<{
    productId: string;
    fieldId: ProductFieldId;
    value: unknown;
  }>();
  /** Two-way sync: the deal value and every product's copy, in one event. */
  const syncedFieldCommitted = createEvent<{
    fieldId: SyncedFieldId;
    value: string;
  }>();
  /** Broadcast: pushes one value into every product; the deal keeps nothing. */
  const broadcastCommitted = createEvent<{
    fieldId: BroadcastFieldId;
    value: unknown;
  }>();

  // --- state
  const $dealFields = createStore<DealFieldsState>({
    notionalCcy: "1xxxxxx",
    premiumCcy: "2",
  });
  const $groups = createStore<GroupsState>({ byId: {}, order: [] });
  const $products = createStore<Record<string, ProductState>>({});
  const $isInternal = createStore(true);

  // --- derived
  const $groupOrder = $groups.map((groups) => groups.order);
  const $hedgeTypes = $isInternal.map((isInternal) =>
    isInternal ? ["abc"] : ["def"],
  );
  /** Issues per product, per field — only changed products are re-validated. */
  const $validation = $products.map(validateProducts);
  const $hasValidationErrors = $validation.map((validation) =>
    Object.values(validation).some((issues) => Object.keys(issues).length > 0),
  );

  // --- groups: build (new ids) from the current deal values, then insert
  const groupCreated = merge([
    sample({
      clock: addGroup,
      source: { deal: $dealFields, groups: $groups },
      fn: ({ deal, groups }, groupType) =>
        createGroup(groupType, deal, groups.order.length),
    }),
    sample({
      clock: cloneGroup,
      source: { deal: $dealFields, groups: $groups, products: $products },
      filter: ({ groups }, groupId) => groupId in groups.byId,
      fn: ({ deal, groups, products }, groupId) => {
        // the copy goes right after the original
        const source = groups.byId[groupId];
        return createGroup(
          source.groupType,
          deal,
          groups.order.indexOf(groupId) + 1,
          source.productIds.map((productId) => products[productId]),
        );
      },
    }),
  ]);
  $groups.on(groupCreated, insertGroup);
  $products.on(groupCreated, (products, { products: created }) => ({
    ...products,
    ...Object.fromEntries(created.map((product) => [product.id, product])),
  }));

  // nothing to dispose: a removed group's products, and their issues, are just gone
  const groupRemoved = sample({
    clock: removeGroupById,
    source: $groups,
    filter: (groups, groupId) => groupId in groups.byId,
    fn: (groups, groupId) => groups.byId[groupId],
  });
  $groups.on(groupRemoved, (groups, group) => removeGroup(groups, group.id));
  $products.on(groupRemoved, (products, group) => {
    const next = { ...products };
    group.productIds.forEach((productId) => delete next[productId]);
    return next;
  });

  // --- fields
  // a product's ccy commit is the two-way sync: it writes the deal and every product
  sample({
    clock: productFieldCommitted,
    filter: ({ fieldId }) => isSyncedField(fieldId),
    fn: ({ fieldId, value }) => ({
      fieldId: fieldId as SyncedFieldId,
      value: String(value),
    }),
    target: syncedFieldCommitted,
  });
  $products.on(productFieldCommitted, (products, { productId, fieldId, value }) => {
    const product = products[productId];
    if (!product || isSyncedField(fieldId)) return products;
    const next = setProductField(product, fieldId, value);
    return next === product ? products : { ...products, [productId]: next };
  });

  $dealFields.on(syncedFieldCommitted, (deal, { fieldId, value }) =>
    deal[fieldId] === value ? deal : { ...deal, [fieldId]: value },
  );
  $products.on(syncedFieldCommitted, (products, { fieldId, value }) =>
    mapProducts(products, (product) => setProductField(product, fieldId, value)),
  );
  $products.on(broadcastCommitted, (products, { fieldId, value }) => {
    if (value === "" || Number.isNaN(value)) return products; // nothing to send
    return mapProducts(products, (product) =>
      setProductField(product, fieldId, value),
    );
  });

  // --- spot price: kept outside the stores, ticks never notify subscribers
  const spotPriceStream = createSpotPriceStream();
  const stopSpotPriceStream = devtools.$isSpotPriceStreamEnabled.watch(
    (enabled) => (enabled ? spotPriceStream.start() : spotPriceStream.stop()),
  );

  return {
    // events
    addGroup,
    cloneGroup,
    removeGroup: removeGroupById,
    productFieldCommitted,
    syncedFieldCommitted,
    broadcastCommitted,
    // stores
    $dealFields,
    $groups,
    $groupOrder,
    $products,
    $isInternal,
    $hedgeTypes,
    $validation,
    $hasValidationErrors,
    // outside the stores
    spotPriceStream,
    dispose: () => {
      stopSpotPriceStream();
      spotPriceStream.stop();
    },
  };
};

export type DealStore = ReturnType<typeof createDealStore>;
