import {
  type Store,
  combine,
  createEffect,
  createEvent,
  createStore,
  merge,
  sample as connect,
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
import { type DealFieldsState, initialDealFields } from "@shared/dealFields.ts";
import { type DealSettingsState, hedgeTypesFor, initialDealSettings } from "@shared/dealSettings.ts";
import { type DealProduct, routeWrites } from "@shared/dealWrites.ts";
import { dealOptionsRequests } from "@shared/fields.ts";
import type { GroupType } from "@shared/groups.ts";
import type { PathWrite } from "@shared/paths.ts";
import type { ProductData } from "@shared/products/productRegistry.ts";
import { optionsRequestsOf, reconcileWrites, uniqueRequests } from "@shared/products/productWrites.ts";
import { createSpotPriceStream } from "@shared/spotPriceStream.ts";
import {
  type GroupsState,
  addGroupReducer,
  cloneGroupReducer,
  groupCreatedReducer,
  groupRemovedReducer,
} from "./groupStore.ts";
import { loadAllOptionsEffect, loadOptionsEffect } from "./optionsStore.ts";
import { type ProductState, validateProducts, withProductWrites } from "./productStore.ts";

/** What a deal needs from the app-wide developer settings. */
type DealDevtools = {
  $isSpotPriceStreamEnabled: Store<boolean>;
  $isAutocalcEnabled: Store<boolean>;
};

/** Updates every product; the same object if none changed (no update, no re-render). */
const mapProducts = (
  products: Record<string, ProductState>,
  update: (product: ProductState) => ProductState,
) => {
  const updated: Record<string, ProductState> = {};
  for (const [id, product] of Object.entries(products)) {
    const next = update(product);
    if (next !== product) updated[id] = next;
  }
  return Object.keys(updated).length ? { ...products, ...updated } : products;
};

/** Every product with where it lives, in display order: what the write router needs. */
const dealProducts = (groups: GroupsState, products: Record<string, ProductState>): DealProduct[] =>
  groups.order.flatMap((groupId) =>
    groups.byId[groupId].productIds.map((productId) => ({ groupId, productId, data: products[productId].data })),
  );

/**
 * One deal's model. State lives in stores keyed by id; every change is an
 * event handled by pure reducers, and derived state (validation, order) is
 * computed from the stores. Products are plain, immutable data, so a product
 * that didn't change keeps its identity and nothing bound to it re-renders.
 *
 * Every write is a batch of dot paths (`writePathsAction`), routed by the
 * shared rules and folded into one new state per store: validation,
 * autocalc, option reloads and the grid each see a paste once.
 */
export const createDealStore = (devtools: DealDevtools) => {
  // --- actions: the requests the UI (or anything else) can make
  const addGroupAction = createEvent<GroupType>();
  const cloneGroupAction = createEvent<string>();
  const removeGroupAction = createEvent<string>();
  /** Writes values at dot paths, in order, as one batch: an edit, a paste, anything. */
  const writePathsAction = createEvent<readonly PathWrite[]>();
  /** Calculates now, if the deal is ready (the manual Calculate). */
  const calculateAction = createEvent();

  // --- state
  const $dealFields = createStore<DealFieldsState>(initialDealFields);
  const $groups = createStore<GroupsState>({ byId: {}, order: [] });
  const $products = createStore<Record<string, ProductState>>({});
  const $settings = createStore<DealSettingsState>(initialDealSettings);

  // --- derived
  const $isInternal = $settings.map((settings) => settings.isInternal);
  const $hedgeTypes = $isInternal.map(hedgeTypesFor);
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

  // --- writes by path: routed by the shared rules, folded into one new state per store
  const routed = connect({
    clock: writePathsAction,
    source: { groups: $groups, products: $products, dealFields: $dealFields, settings: $settings },
    fn: ({ groups, products, dealFields, settings }, writes) =>
      routeWrites({ dealFields, settings, products: dealProducts(groups, products) }, writes),
  });
  $dealFields.on(routed, (_, { dealFields }) => dealFields);
  $settings.on(routed, (_, { settings }) => settings);
  $products.on(routed, (products, { products: writes }) =>
    mapProducts(products, (product) => {
      const productWrites = writes.get(product.id)?.writes;
      return productWrites ? withProductWrites(product, productWrites) : product;
    }),
  );

  // --- async options (e.g. Fixing Source): loaded for a new group, reloaded on change
  connect({
    clock: groupCreated,
    fn: ({ products }) => uniqueRequests(products.flatMap(({ data }) => optionsRequestsOf(data))),
    target: loadAllOptionsEffect,
  });
  connect({
    clock: routed,
    filter: ({ requests }) => requests.length > 0,
    fn: ({ requests }) => requests,
    target: loadAllOptionsEffect,
  });
  // options arrived: products still on that parameter keep their value if it's
  // an option, else take the first (stale responses: ignored)
  $products.on(loadOptionsEffect.done, (products, { params, result }) =>
    mapProducts(products, (product) => withProductWrites(product, reconcileWrites(product.data, params, result))),
  );

  // the deal column's own options (its default parameters), loaded with the deal
  loadAllOptionsEffect(dealOptionsRequests);

  // --- calc: whenever the deal is ready, with autocalc; any edit outdates the price
  const $calc = createStore<CalcState>(initialCalcState);
  const $isReady = combine(
    $hasValidationErrors,
    loadOptionsEffect.inFlight,
    loadAllOptionsEffect.inFlight,
    (hasErrors, loading, loadingAll) => isCalcReady(hasErrors, loading + loadingAll),
  );
  const calculateEffect = createEffect(({ products }: { requestId: number; products: ProductData[] }) =>
    calculatePrice(products),
  );
  $calc
    .on($products, (calc) => calcInputsChanged(calc))
    .on(calculateEffect, (calc, { requestId }) => calcStarted(calc, requestId))
    .on(calculateEffect.done, (calc, { params, result }) => calcSucceeded(calc, params.requestId, result))
    .on(calculateEffect.fail, (calc, { params }) => calcFailed(calc, params.requestId));

  const calcRequest = ({ calc, products }: { calc: CalcState; products: Record<string, ProductState> }) => ({
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
  const stopSpotPriceStream = devtools.$isSpotPriceStreamEnabled.watch((enabled) =>
    enabled ? spotPriceStream.start() : spotPriceStream.stop(),
  );

  return {
    actions: {
      addGroupAction,
      cloneGroupAction,
      removeGroupAction,
      writePathsAction,
      calculateAction,
    },
    // stores
    $dealFields,
    $groups,
    $products,
    $settings,
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
