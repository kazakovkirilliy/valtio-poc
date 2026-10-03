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
import {
  type DealSettingId,
  type DealSettingsState,
  hedgeTypesFor,
  initialDealSettings,
  isDealSetting,
  withSetting,
} from "@shared/dealSettings.ts";
import { type ProductFieldId, dealOptionsRequests } from "@shared/fields.ts";
import { type CellWrite, DEAL_COLUMN_ID } from "@shared/grid/gridSource.ts";
import type { GroupType } from "@shared/groups.ts";
import type { ProductData } from "@shared/products/productRegistry.ts";
import { setIn } from "@shared/lib/path.ts";
import { createSpotPriceStream } from "@shared/spotPriceStream.ts";
import {
  type GroupsState,
  addGroupReducer,
  cloneGroupReducer,
  groupCreatedReducer,
  groupRemovedReducer,
  mapProducts,
  productOf,
  productsOf,
} from "./groupStore.ts";
import { loadAllOptionsEffect, loadOptionsEffect } from "./optionsStore.ts";
import {
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

/**
 * One deal's model, with nested state: one `$groups` store holds the groups
 * by id, and each group holds its products by id — no id lists to keep in
 * step. Key order is display order. Every change is an event handled by
 * pure reducers that copy only the path to what changed, so an untouched
 * group or product keeps its identity and nothing bound to it re-renders.
 *
 * The events the UI may call are returned as `actions`; events the model
 * derives for itself (e.g. `groupCreated`) stay inside.
 */
export const createDealStore = (devtools: DealDevtools) => {
  const actions = {
    // --- actions: the requests the UI (or anything else) can make
    addGroupAction: createEvent<GroupType>(),
    cloneGroupAction: createEvent<string>(),
    removeGroupAction: createEvent<string>(),
    /** Writes one field of one product, addressed by its group. */
    setProductFieldAction: createEvent<{
      groupId: string;
      productId: string;
      fieldId: ProductFieldId;
      value: unknown;
    }>(),
    /** Two-way sync: the deal value and every product's copy, in one event. */
    setTwoWaySyncAction: createEvent<{
      fieldId: SyncedFieldId;
      value: unknown;
    }>(),
    /** Pushes one value into every product; the deal keeps nothing. */
    broadcastFieldAction: createEvent<{
      fieldId: BroadcastFieldId;
      value: unknown;
    }>(),
    /** Calculates now, if the deal is ready (the manual Calculate). */
    calculateAction: createEvent(),
    /** Sets a deal setting (internal, hedge type); a hedge type stays one of its options. */
    setSettingAction: createEvent<{ id: DealSettingId; value: unknown }>(),
    /** Writes many cells at once (a grid paste or edit): one update of each store. */
    writeCellsAction: createEvent<readonly CellWrite[]>(),
  };

  // --- state
  const $dealFields = createStore<DealFieldsState>(initialDealFields);
  const $groups = createStore<GroupsState>({});
  const $settings = createStore<DealSettingsState>(initialDealSettings).on(
    actions.setSettingAction,
    (settings, { id, value }) => withSetting(settings, id, value),
  );

  // --- derived
  const $isInternal = $settings.map((settings) => settings.isInternal);
  const $hedgeTypes = $isInternal.map(hedgeTypesFor);
  /** Issues per product, per field — only changed products are re-validated. */
  const $validation = $groups.map((groups) =>
    validateProducts(productsOf(groups)),
  );
  const $hasValidationErrors = $validation.map((validation) =>
    Object.values(validation).some((issues) => Object.keys(issues).length > 0),
  );

  // --- groups: build (new ids) from the current deal values, then insert
  const groupCreated = merge([
    connect({
      clock: actions.addGroupAction,
      source: { defaults: $dealFields, groups: $groups },
      fn: addGroupReducer,
    }),
    connect({
      clock: actions.cloneGroupAction,
      source: { defaults: $dealFields, groups: $groups },
      filter: ({ groups }, groupId) => groupId in groups,
      fn: cloneGroupReducer,
    }),
  ]);
  $groups.on(groupCreated, groupCreatedReducer);
  // nothing to dispose: the group's products, and their issues, go with it
  $groups.on(actions.removeGroupAction, groupRemovedReducer);

  // --- fields
  // setting a product's ccy is the two-way sync: it writes the deal and every product
  connect({
    clock: actions.setProductFieldAction,
    filter: ({ fieldId }) => isSyncedField(fieldId),
    fn: ({ fieldId, value }) => ({ fieldId: fieldId as SyncedFieldId, value }),
    target: actions.setTwoWaySyncAction,
  });

  $groups.on(
    actions.setProductFieldAction,
    (groups, { groupId, productId, fieldId, value }) => {
      const product = productOf(groups, groupId, productId);
      if (!product || isSyncedField(fieldId)) return groups;
      // copies only the path to the product: the groups, its group, its products
      return setIn(
        groups,
        `${groupId}.products.${productId}`,
        setProductField(product, fieldId, value),
      );
    },
  );

  const withDealField = (
    deal: DealFieldsState,
    fieldId: SyncedFieldId,
    value: unknown,
  ) => (Object.is(deal[fieldId], value) ? deal : { ...deal, [fieldId]: value });
  $dealFields.on(actions.setTwoWaySyncAction, (deal, { fieldId, value }) =>
    withDealField(deal, fieldId, value),
  );
  $groups.on(actions.setTwoWaySyncAction, (groups, { fieldId, value }) =>
    mapProducts(groups, (product) => setProductField(product, fieldId, value)),
  );
  $groups.on(actions.broadcastFieldAction, (groups, { fieldId, value }) => {
    if (isEmptyBroadcast(value)) return groups; // nothing to send
    return mapProducts(groups, (product) =>
      setProductField(product, fieldId, value),
    );
  });

  // --- many cells at once: every write folded into one new state per store,
  // so validation, autocalc and the grid each see the batch once
  $dealFields.on(actions.writeCellsAction, (deal, writes) =>
    writes.reduce(
      (next, { fieldId, value }) =>
        isSyncedField(fieldId) ? withDealField(next, fieldId, value) : next,
      deal,
    ),
  );
  $groups.on(actions.writeCellsAction, (groups, writes) =>
    writes.reduce((next, { columnId, fieldId, value }) => {
      if (fieldId === "spotStream" || isDealSetting(fieldId)) return next; // settings: setSettingAction
      const toEvery =
        isSyncedField(fieldId) ||
        (columnId === DEAL_COLUMN_ID &&
          isBroadcastField(fieldId) &&
          !isEmptyBroadcast(value));
      if (toEvery)
        return mapProducts(next, (product) =>
          setProductField(product, fieldId, value),
        );
      const group = Object.values(next).find(
        (candidate) => columnId in candidate.products,
      );
      if (!group) return next; // the deal column's other fields hold nothing
      const product = group.products[columnId];
      // copies only the path to the product
      return setIn(
        next,
        `${group.id}.products.${columnId}`,
        setProductField(product, fieldId, value),
      );
    }, groups),
  );

  // --- async options (e.g. Fixing Source): each depends on another product field
  // load them for a new group's products (one request per source and parameter) …
  connect({
    clock: groupCreated,
    fn: ({ group }) => optionsRequestsOf(Object.values(group.products)),
    target: loadAllOptionsEffect,
  });
  // … and reload them whenever that field changes, in one product or broadcast to all
  connect({
    clock: actions.setProductFieldAction,
    fn: ({ fieldId, value }) => optionsRequestsFor(fieldId, value),
    target: loadAllOptionsEffect,
  });
  connect({
    clock: actions.broadcastFieldAction,
    filter: ({ value }) => !isEmptyBroadcast(value),
    fn: ({ fieldId, value }) => optionsRequestsFor(fieldId, value),
    target: loadAllOptionsEffect,
  });
  connect({
    clock: actions.writeCellsAction,
    fn: optionsRequestsForWrites,
    target: loadAllOptionsEffect,
  });
  // options arrived: products still on that parameter keep their value if it's
  // an option, else take the first (stale responses: ignored)
  $groups.on(loadOptionsEffect.done, (groups, { params, result }) =>
    mapProducts(groups, (product) =>
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
    .on($groups, (calc) => calcInputsChanged(calc))
    .on(calculateEffect, (calc, { requestId }) => calcStarted(calc, requestId))
    .on(calculateEffect.done, (calc, { params, result }) =>
      calcSucceeded(calc, params.requestId, result),
    )
    .on(calculateEffect.fail, (calc, { params }) =>
      calcFailed(calc, params.requestId),
    );

  const calcRequest = ({
    calc,
    groups,
  }: {
    calc: CalcState;
    groups: GroupsState;
  }) => ({
    requestId: calc.requestId + 1,
    products: productsOf(groups).map((product) => product.data),
  });
  connect({
    clock: actions.calculateAction,
    source: { calc: $calc, groups: $groups, isReady: $isReady },
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
    source: { calc: $calc, groups: $groups, should: $shouldAutocalc },
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
    actions,
    // stores
    $dealFields,
    $groups,
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
