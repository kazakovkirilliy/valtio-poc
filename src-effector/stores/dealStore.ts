import {
  combine,
  createEffect,
  createEvent,
  createStore,
  merge,
  sample as connect,
  type Store,
} from "effector";
import { calculatePrice } from "@shared/api/calculate.ts";
import {
  type CalcState,
  calcFailed,
  calcInputsChanged,
  calcStarted,
  calcSucceeded,
  initialCalcState,
  isCalcReady,
  needsAutocalc,
} from "@shared/calc.ts";
import {
  type BroadcastFieldId,
  type DealFieldsState,
  type SyncedFieldId,
  initialDealFields,
  isBroadcastField,
  isEmptyBroadcast,
  isSyncedField,
} from "@shared/dealFields.ts";
import { type ProductFieldId, dealOptionsRequests } from "@shared/fields.ts";
import { type CellWrite, DEAL_COLUMN_ID } from "@shared/grid/gridSource.ts";
import type { GroupType } from "@shared/groups.ts";
import type { ProductData } from "@shared/products/productRegistry.ts";
import { createSpotPriceStream } from "@shared/spotPriceStream.ts";
import {
  type GroupsState,
  addGroupReducer,
  cloneGroupReducer,
  groupCreatedReducer,
  groupRemovedReducer,
} from "./groupStore.ts";
import { loadAllOptionsEffect, loadOptionsEffect } from "./optionsStore.ts";
import {
  type ProductState,
  optionsRequestsFor,
  optionsRequestsForWrites,
  optionsRequestsOf,
  reconcileProductOptions,
  setProductField,
  validateProducts,
} from "./productStore.ts";

/** What a deal needs from the app-wide developer settings. */
type DealDevtools = {
  $isSpotPriceStreamEnabled: Store<boolean>;
  $isAutocalcEnabled: Store<boolean>;
};

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
 * computed from the stores. Products are plain data, written through
 * `setProductField`, so a product that didn't change keeps its identity and
 * nothing bound to it re-renders.
 *
 * The events the UI may call are returned as `actions`; events the model
 * derives for itself (e.g. `groupCreated`) stay inside.
 */
export const createDealStore = (devtools: DealDevtools) => {
  // --- actions: the requests the UI (or anything else) can make
  const addGroupAction = createEvent<GroupType>();
  const cloneGroupAction = createEvent<string>();
  const removeGroupAction = createEvent<string>();
  /** Writes one field of one product. */
  const setProductFieldAction = createEvent<{
    productId: string;
    fieldId: ProductFieldId;
    value: unknown;
  }>();
  /** Two-way sync: the deal value and every product's copy, in one event. */
  const setTwoWaySyncAction = createEvent<{
    fieldId: SyncedFieldId;
    value: unknown;
  }>();
  /** Pushes one value into every product; the deal keeps nothing. */
  const broadcastFieldAction = createEvent<{
    fieldId: BroadcastFieldId;
    value: unknown;
  }>();
  /** Calculates now, if the deal is ready (the manual Calculate). */
  const calculateAction = createEvent();
  /** Writes many cells at once (a grid paste or edit): one update of each store. */
  const writeCellsAction = createEvent<readonly CellWrite[]>();

  // --- state
  const $dealFields = createStore<DealFieldsState>(initialDealFields);
  const $groups = createStore<GroupsState>({ byId: {}, order: [] });
  const $products = createStore<Record<string, ProductState>>({});
  const $isInternal = createStore(true);

  // --- derived
  const $groupOrder = $groups.map((groups) => groups.order);
  const $hedgeTypes = $isInternal.map((isInternal) =>
    isInternal ? ["a", "b", "c"] : ["d", "e", "f"],
  );
  /** Issues per product, per field — only changed products are re-validated. */
  const $validation = $products.map(validateProducts);
  const $hasValidationErrors = $validation.map((validation) =>
    Object.values(validation).some((issues) => Object.keys(issues).length > 0),
  );

  // --- groups: build (new ids) from the current deal values, then insert
  const groupCreated = merge([
    connect({
      clock: addGroupAction,
      source: { defaults: $dealFields, groups: $groups },
      fn: addGroupReducer,
    }),
    connect({
      clock: cloneGroupAction,
      source: { defaults: $dealFields, groups: $groups, products: $products },
      filter: ({ groups }, groupId) => groupId in groups.byId,
      fn: cloneGroupReducer,
    }),
  ]);
  $groups.on(groupCreated, groupCreatedReducer);
  $products.on(groupCreated, (products, { products: created }) => ({
    ...products,
    ...Object.fromEntries(created.map((product) => [product.id, product])),
  }));

  // nothing to dispose: a removed group's products, and their issues, are just gone
  const groupRemoved = connect({
    clock: removeGroupAction,
    source: $groups,
    filter: (groups, groupId) => groupId in groups.byId,
    fn: (groups, groupId) => groups.byId[groupId],
  });
  $groups.on(groupRemoved, groupRemovedReducer);
  $products.on(groupRemoved, (products, group) => {
    const next = { ...products };
    group.productIds.forEach((productId) => delete next[productId]);
    return next;
  });

  // --- fields
  // setting a product's ccy is the two-way sync: it writes the deal and every product
  connect({
    clock: setProductFieldAction,
    filter: ({ fieldId }) => isSyncedField(fieldId),
    fn: ({ fieldId, value }) => ({ fieldId: fieldId as SyncedFieldId, value }),
    target: setTwoWaySyncAction,
  });
  $products.on(
    setProductFieldAction,
    (products, { productId, fieldId, value }) => {
      const product = products[productId];
      if (!product || isSyncedField(fieldId)) return products;
      const next = setProductField(product, fieldId, value);
      return next === product ? products : { ...products, [productId]: next };
    },
  );

  const withDealField = (
    deal: DealFieldsState,
    fieldId: SyncedFieldId,
    value: unknown,
  ) => (Object.is(deal[fieldId], value) ? deal : { ...deal, [fieldId]: value });
  $dealFields.on(setTwoWaySyncAction, (deal, { fieldId, value }) =>
    withDealField(deal, fieldId, value),
  );
  $products.on(setTwoWaySyncAction, (products, { fieldId, value }) =>
    mapProducts(products, (product) =>
      setProductField(product, fieldId, value),
    ),
  );
  $products.on(broadcastFieldAction, (products, { fieldId, value }) => {
    if (isEmptyBroadcast(value)) return products; // nothing to send
    return mapProducts(products, (product) =>
      setProductField(product, fieldId, value),
    );
  });

  // --- many cells at once: every write folded into one new state per store,
  // so validation, autocalc and the grid each see the batch once
  $dealFields.on(writeCellsAction, (deal, writes) =>
    writes.reduce(
      (next, { fieldId, value }) =>
        isSyncedField(fieldId) ? withDealField(next, fieldId, value) : next,
      deal,
    ),
  );
  $products.on(writeCellsAction, (products, writes) =>
    writes.reduce((next, { columnId, fieldId, value }) => {
      if (fieldId === "spotStream") return next;
      const toEvery =
        isSyncedField(fieldId) ||
        (columnId === DEAL_COLUMN_ID &&
          isBroadcastField(fieldId) &&
          !isEmptyBroadcast(value));
      if (toEvery)
        return mapProducts(next, (product) =>
          setProductField(product, fieldId, value),
        );
      const product = next[columnId];
      if (!product) return next; // the deal column's other fields hold nothing
      const updated = setProductField(product, fieldId, value);
      return updated === product ? next : { ...next, [columnId]: updated };
    }, products),
  );

  // --- async options (e.g. Fixing Source): each depends on another product field
  // load them for a new group's products (one request per source and parameter) …
  connect({
    clock: groupCreated,
    fn: ({ products }) => optionsRequestsOf(products),
    target: loadAllOptionsEffect,
  });
  // … and reload them whenever that field changes, in one product or broadcast to all
  connect({
    clock: setProductFieldAction,
    fn: ({ fieldId, value }) => optionsRequestsFor(fieldId, value),
    target: loadAllOptionsEffect,
  });
  connect({
    clock: broadcastFieldAction,
    filter: ({ value }) => !isEmptyBroadcast(value),
    fn: ({ fieldId, value }) => optionsRequestsFor(fieldId, value),
    target: loadAllOptionsEffect,
  });
  connect({
    clock: writeCellsAction,
    fn: optionsRequestsForWrites,
    target: loadAllOptionsEffect,
  });
  // options arrived: products still on that parameter keep their value if it's
  // an option, else take the first (stale responses: ignored)
  $products.on(loadOptionsEffect.done, (products, { params, result }) =>
    mapProducts(products, (product) =>
      reconcileProductOptions(product, params, result),
    ),
  );

  // the deal column's own options (its default parameters), loaded with the deal
  loadAllOptionsEffect(dealOptionsRequests);

  // --- calc: whenever the deal is ready, with autocalc; any edit outdates the price
  const $calc = createStore<CalcState>(initialCalcState);
  const $isReady = combine(
    $hasValidationErrors,
    loadOptionsEffect.inFlight,
    loadAllOptionsEffect.inFlight,
    (hasErrors, loading, loadingAll) =>
      isCalcReady(hasErrors, loading + loadingAll),
  );
  const calculateEffect = createEffect(
    ({ products }: { requestId: number; products: ProductData[] }) =>
      calculatePrice(products),
  );
  $calc
    .on($products, (calc) => calcInputsChanged(calc))
    .on(calculateEffect, (calc, { requestId }) => calcStarted(calc, requestId))
    .on(calculateEffect.done, (calc, { params, result }) =>
      calcSucceeded(calc, params.requestId, result),
    )
    .on(calculateEffect.fail, (calc, { params }) =>
      calcFailed(calc, params.requestId),
    );

  const calcRequest = ({
    calc,
    products,
  }: {
    calc: CalcState;
    products: Record<string, ProductState>;
  }) => ({
    requestId: calc.requestId + 1,
    products: Object.values(products).map((product) => product.data),
  });
  connect({
    clock: calculateAction,
    source: { calc: $calc, products: $products, isReady: $isReady },
    filter: ({ isReady }) => isReady,
    fn: calcRequest,
    target: calculateEffect,
  });
  const $shouldAutocalc = combine(
    devtools.$isAutocalcEnabled,
    $isReady,
    $calc,
    (enabled, isReady, calc) => enabled && isReady && needsAutocalc(calc),
  );
  connect({
    clock: $shouldAutocalc,
    source: { calc: $calc, products: $products, should: $shouldAutocalc },
    filter: ({ should }) => should,
    fn: calcRequest,
    target: calculateEffect,
  });

  // --- spot price: kept outside the stores, ticks never notify subscribers
  const spotPriceStream = createSpotPriceStream();
  const stopSpotPriceStream = devtools.$isSpotPriceStreamEnabled.watch(
    (enabled) => (enabled ? spotPriceStream.start() : spotPriceStream.stop()),
  );

  return {
    actions: {
      addGroupAction,
      cloneGroupAction,
      removeGroupAction,
      setProductFieldAction,
      setTwoWaySyncAction,
      broadcastFieldAction,
      calculateAction,
      writeCellsAction,
    },
    // stores
    $dealFields,
    $groups,
    $groupOrder,
    $products,
    $isInternal,
    $hedgeTypes,
    $validation,
    $hasValidationErrors,
    $calc,
    $isReady,
    // outside the stores
    spotPriceStream,
    dispose: () => {
      stopSpotPriceStream();
      spotPriceStream.stop();
    },
  };
};

export type DealStore = ReturnType<typeof createDealStore>;
