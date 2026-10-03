import {
  type Store,
  combine,
  createEffect,
  createEvent,
  createStore,
  merge,
  sample as connect,
} from "effector";
import { keyval, lens } from "@effector/model";
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
  type DealFieldsState,
  type SyncedFieldId,
  initialDealFields,
  isBroadcastField,
  isEmptyBroadcast,
  isSyncedField,
} from "@shared/dealFields.ts";
import {
  type DealSettingsState,
  hedgeTypesFor,
  initialDealSettings,
  isDealSetting,
  withSetting,
} from "@shared/dealSettings.ts";
import {
  type ProductFieldId,
  asyncOptionFields,
  dealOptionsRequests,
  existsForParam,
} from "@shared/fields.ts";
import { type GroupType, groupDefinitions, groupTitle, productUi } from "@shared/groups.ts";
import { getValueByPath } from "@shared/lib/path.ts";
import { uuid } from "@shared/lib/uuid.ts";
import { type Option, optionsKey } from "@shared/options/optionsSource.ts";
import {
  type ProductData,
  type ProductUi,
  definitionOf,
} from "@shared/products/productRegistry.ts";
import { createSpotPriceStream } from "@shared/spotPriceStream.ts";
import type { FieldIssues } from "@shared/validation.ts";
import { type OptionsRequest, loadAllOptionsEffect, loadOptionsEffect } from "./optionsStore.ts";
import { type PathWrite, parsePath } from "./paths.ts";
import { type ProductWrite, definitionOfData, fieldAtPath, productsModel } from "./productModel.ts";

/** What a deal needs from the app-wide developer settings. */
type DealDevtools = {
  $isSpotPriceStreamEnabled: Store<boolean>;
  $isAutocalcEnabled: Store<boolean>;
};

/** A product as the collections show it: its own stores' values. */
export type ProductItem = { id: string; ui: ProductUi; data: ProductData | null; issues: FieldIssues };
export type GroupItem = {
  id: string;
  groupType: GroupType;
  ui: { title: string; index: number };
  products: ProductItem[];
};

/** Each product's writes from one batch, in order. */
type ProductWrites = { productId: string; writes: ProductWrite[] };

/**
 * A group, as one item of an `@effector/model` collection: its own stores,
 * and its products as a nested collection. Its api passes writes on to the
 * products they address.
 *
 * Each deal builds its collection from this function (`keyval(createGroup)`),
 * not by cloning a collection: a cloned model's `create` runs once more to
 * read its shape, with nested collections as placeholders that have no api.
 */
const createGroup = () => {
  const $id = createStore("");
  const $groupType = createStore<GroupType>("VanillaGroup");
  const $ui = createStore({ title: "", index: 0 });
  const products = keyval(productsModel);

  /** Each addressed product's writes: one api call for all of them. */
  const writeProducts = createEvent<readonly ProductWrites[]>();
  connect({
    clock: writeProducts,
    fn: (lists) => ({ key: lists.map(({ productId }) => productId), data: lists.map(({ writes }) => writes) }),
    target: products.api.write,
  });
  /** Options arrived: every product reconciles the fields that use them. */
  const reconcileOptions = createEvent<{ request: OptionsRequest; options: readonly Option[] }>();
  connect({
    clock: reconcileOptions,
    source: products.$keys,
    fn: (keys, payload) => ({ key: keys, data: keys.map(() => payload) }),
    target: products.api.reconcileOptions,
  });

  return {
    key: "id" as const,
    state: { id: $id, groupType: $groupType, ui: $ui, products },
    api: { writeProducts, reconcileOptions },
  };
};

const productsOf = (groups: readonly GroupItem[]) => groups.flatMap((group) => group.products);

/** The options to (re)load when `fieldId` takes `value`. */
const optionsRequestsFor = (fieldId: ProductFieldId, value: unknown): OptionsRequest[] =>
  asyncOptionFields
    .filter(({ options }) => options.dependsOn === fieldId && existsForParam(options, value))
    .map(({ options }) => ({ source: options.source, param: String(value) }));

const uniqueRequests = (requests: readonly OptionsRequest[]) =>
  [...new Map(requests.map((request) => [optionsKey(request.source, request.param), request])).values()];

const withDealField = (deal: DealFieldsState, fieldId: SyncedFieldId, value: unknown) =>
  Object.is(deal[fieldId], value) ? deal : { ...deal, [fieldId]: value };

/**
 * A batch of path writes, routed: the deal's own values (synced fields,
 * settings) and each product's writes, in order. Synced fields (from the
 * deal or any product) and deal broadcasts go to every product.
 */
const routeWrites = (
  state: { groups: readonly GroupItem[]; dealFields: DealFieldsState; settings: DealSettingsState },
  writes: readonly PathWrite[],
) => {
  let { dealFields, settings } = state;
  const targets = state.groups.flatMap((group) =>
    group.products.flatMap((product) => (product.data ? [{ groupId: group.id, product, data: product.data }] : [])),
  );
  const lists = new Map<string, { groupId: string; productId: string; writes: ProductWrite[] }>();
  const toProduct = (groupId: string, productId: string, write: ProductWrite) => {
    if (!lists.has(productId)) lists.set(productId, { groupId, productId, writes: [] });
    lists.get(productId)!.writes.push(write);
  };
  const requests: OptionsRequest[] = [];
  const toEvery = (fieldId: ProductFieldId, value: unknown) => {
    for (const { groupId, product } of targets) toProduct(groupId, product.id, { fieldId, value });
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
    const found = targets.find(({ groupId, product }) => groupId === target.groupId && product.id === target.productId);
    if (!found) continue;
    const fieldId = fieldAtPath(definitionOfData(found.data), target.dataPath);
    if (fieldId && isSyncedField(fieldId)) {
      // a product's synced field is the two-way sync: the deal and every product
      dealFields = withDealField(dealFields, fieldId, value);
      toEvery(fieldId, value);
    } else {
      toProduct(found.groupId, found.product.id, { path: target.dataPath, value });
      if (fieldId) requests.push(...optionsRequestsFor(fieldId, value));
    }
  }

  const byGroup = new Map<string, ProductWrites[]>();
  for (const { groupId, productId, writes: productWrites } of lists.values()) {
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId)!.push({ productId, writes: productWrites });
  }
  return { dealFields, settings, byGroup, requests: uniqueRequests(requests) };
};

/**
 * One deal's model, on `@effector/model`: the groups are a collection whose
 * items each hold their products as a nested collection, so every group and
 * product has its own stores and api. `$order` keeps the display order.
 *
 * Everything is addressed by dot path (see `paths.ts`): `writePathsAction`
 * takes a batch of path writes and routes it, in one event, to the deal's
 * own stores and to the products it addresses (one api call for all of
 * them); `readPath` and `pathStore` read any path.
 */
export const createDealStore = (devtools: DealDevtools) => {
  const actions = {
    addGroupAction: createEvent<GroupType>(),
    cloneGroupAction: createEvent<string>(),
    removeGroupAction: createEvent<string>(),
    /** Writes values at dot paths, in order, as one batch: an edit, a paste, anything the old app wrote. */
    writePathsAction: createEvent<readonly PathWrite[]>(),
    /** Calculates now, if the deal is ready (the manual Calculate). */
    calculateAction: createEvent(),
  };

  // --- state
  const groups = keyval(createGroup);
  const $groupsById = groups.$items as unknown as Store<GroupItem[]>;
  const $order = createStore<string[]>([]);
  const $dealFields = createStore<DealFieldsState>(initialDealFields);
  const $settings = createStore<DealSettingsState>(initialDealSettings);

  // --- derived
  /** The groups in display order. */
  const $groups = combine($groupsById, $order, (items, order) => {
    const byId = new Map(items.map((group) => [group.id, group]));
    return order.flatMap((id) => byId.get(id) ?? []);
  });
  const $isInternal = $settings.map((settings) => settings.isInternal);
  const $hedgeTypes = $isInternal.map(hedgeTypesFor);
  /** Issues per product id: each product's own derived store, re-validated only when its data changes. */
  const $validation = $groups.map((items) =>
    Object.fromEntries(productsOf(items).map((product) => [product.id, product.issues])),
  );
  const $hasValidationErrors = $groups.map((items) =>
    productsOf(items).some((product) => Object.keys(product.issues).length > 0),
  );

  // --- groups: built (new ids) from the current deal values, inserted at a position
  const buildGroup = (groupType: GroupType, defaults: DealFieldsState, position: number, source?: GroupItem) => ({
    id: uuid(),
    groupType,
    ui: { index: position, title: groupTitle(groupType, position) },
    products: groupDefinitions[groupType].productTypes.map((productType, index) => {
      const sourceData = source?.products[index]?.data;
      return {
        id: uuid(),
        ui: productUi(productType, index),
        data: sourceData ? structuredClone(sourceData) : definitionOf(productType).createData(defaults),
      };
    }),
  });
  const groupCreated = merge([
    connect({
      clock: actions.addGroupAction,
      source: { defaults: $dealFields, order: $order },
      fn: ({ defaults, order }, groupType) => ({
        group: buildGroup(groupType, defaults, order.length),
        position: order.length,
      }),
    }),
    connect({
      clock: actions.cloneGroupAction,
      source: { defaults: $dealFields, order: $order, items: $groupsById },
      filter: ({ order }, groupId) => order.includes(groupId),
      fn: ({ defaults, order, items }, groupId) => {
        const source = items.find((group) => group.id === groupId)!;
        const position = order.indexOf(groupId) + 1;
        return { group: buildGroup(source.groupType, defaults, position, source), position };
      },
    }),
  ]);
  connect({ clock: groupCreated, fn: ({ group }) => group as never, target: groups.edit.add });
  $order.on(groupCreated, (order, { group, position }) => [
    ...order.slice(0, position),
    group.id,
    ...order.slice(position),
  ]);
  const groupRemoved = connect({
    clock: actions.removeGroupAction,
    source: $order,
    filter: (order, groupId) => order.includes(groupId),
    fn: (_, groupId) => groupId,
  });
  connect({ clock: groupRemoved, target: groups.edit.remove });
  $order.on(groupRemoved, (order, groupId) => order.filter((id) => id !== groupId));
  // titles follow positions: only groups whose position changed get a new `ui`
  const groupsReindexed = connect({
    clock: $order,
    source: $groupsById,
    fn: (items, order) =>
      items.flatMap((group) => {
        const index = order.indexOf(group.id);
        const title = groupTitle(group.groupType, index);
        return index < 0 || (group.ui.index === index && group.ui.title === title)
          ? []
          : [{ id: group.id, ui: { index, title } }];
      }),
  });
  connect({
    clock: groupsReindexed,
    filter: (updates) => updates.length > 0,
    fn: (updates) => updates as never,
    target: groups.edit.update,
  });

  // --- writes by path: one event, routed to the deal's stores and the products addressed
  const routed = connect({
    clock: actions.writePathsAction,
    source: { groups: $groups, dealFields: $dealFields, settings: $settings },
    fn: routeWrites,
  });
  $dealFields.on(routed, (_, { dealFields }) => dealFields);
  $settings.on(routed, (_, { settings }) => settings);
  connect({
    clock: routed,
    filter: ({ byGroup }) => byGroup.size > 0,
    fn: ({ byGroup }) => ({ key: [...byGroup.keys()], data: [...byGroup.values()] }),
    target: groups.api.writeProducts,
  });

  // --- async options (e.g. Fixing Source): loaded for a new group, reloaded on change
  connect({
    clock: groupCreated,
    fn: ({ group }) =>
      uniqueRequests(
        group.products.flatMap(({ data }) =>
          asyncOptionFields.flatMap(({ options }) => {
            const param = getValueByPath(data, definitionOfData(data).fieldPaths[options.dependsOn]);
            return existsForParam(options, param) ? [{ source: options.source, param: String(param) }] : [];
          }),
        ),
      ),
    target: loadAllOptionsEffect,
  });
  connect({ clock: routed, filter: ({ requests }) => requests.length > 0, fn: ({ requests }) => requests, target: loadAllOptionsEffect });
  // options arrived: every product still on that parameter reconciles (stale responses: ignored)
  connect({
    clock: loadOptionsEffect.done,
    source: $order,
    filter: (order) => order.length > 0,
    fn: (order, { params, result }) => ({ key: order, data: order.map(() => ({ request: params, options: result })) }),
    target: groups.api.reconcileOptions,
  });
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
    .on($groupsById, (calc) => calcInputsChanged(calc))
    .on(calculateEffect, (calc, { requestId }) => calcStarted(calc, requestId))
    .on(calculateEffect.done, (calc, { params, result }) => calcSucceeded(calc, params.requestId, result))
    .on(calculateEffect.fail, (calc, { params }) => calcFailed(calc, params.requestId));
  const calcRequest = ({ calc, items }: { calc: CalcState; items: GroupItem[] }) => ({
    requestId: calc.requestId + 1,
    products: productsOf(items).flatMap(({ data }) => (data ? [data] : [])),
  });
  connect({
    clock: actions.calculateAction,
    source: { calc: $calc, items: $groups, isReady: $isReady },
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
    source: { calc: $calc, items: $groups, should: $shouldAutocalc },
    filter: ({ should }) => should,
    fn: calcRequest,
    target: calculateEffect,
  });

  // --- reading by path
  const findProduct = (items: readonly GroupItem[], groupId: string, productId: string) =>
    items.find((group) => group.id === groupId)?.products.find((product) => product.id === productId);

  /** The value at a dot path now (`undefined` where there is none). */
  const readPath = (path: string): unknown => {
    const target = parsePath(path);
    if (!target) return undefined;
    if (target.kind === "deal") {
      if (isDealSetting(target.key)) return $settings.getState()[target.key];
      return isSyncedField(target.key) ? $dealFields.getState()[target.key] : undefined;
    }
    const data = findProduct($groupsById.getState(), target.groupId, target.productId)?.data;
    return data ? getValueByPath(data, target.dataPath) : undefined;
  };

  /**
   * A store of the value at a dot path, updated only when that value
   * changes; one per path. A product path reads its group through the
   * collection's lens, so other groups' writes never reach it.
   */
  const pathStores = new Map<string, Store<unknown>>();
  const pathStore = (path: string): Store<unknown> => {
    const cached = pathStores.get(path);
    if (cached) return cached;
    const target = parsePath(path);
    let store: Store<unknown>;
    if (!target || target.kind === "deal") {
      store = combine($dealFields, $settings, () => readPath(path));
    } else {
      const $group = lens(groups).itemStore(createStore(target.groupId)) as unknown as Store<GroupItem | null>;
      store = $group.map((group) => {
        const data = group?.products.find((product) => product.id === target.productId)?.data;
        return data ? getValueByPath(data, target.dataPath) : undefined;
      }, { skipVoid: false });
    }
    pathStores.set(path, store);
    return store;
  };

  // --- spot price: kept outside the stores, ticks never notify subscribers
  const spotPriceStream = createSpotPriceStream();
  const stopSpotPriceStream = devtools.$isSpotPriceStreamEnabled.watch((enabled) =>
    enabled ? spotPriceStream.start() : spotPriceStream.stop(),
  );

  return {
    actions,
    /** The groups collection (`@effector/model`), for its lenses and api. */
    groups,
    // stores
    $order,
    $groups,
    $dealFields,
    $settings,
    $isInternal,
    $hedgeTypes,
    $validation,
    $hasValidationErrors,
    $calc,
    $isReady,
    // by path
    readPath,
    pathStore,
    // outside the stores
    spotPriceStream,
    dispose: () => {
      stopSpotPriceStream();
      spotPriceStream.stop();
    },
  };
};

export type DealStore = ReturnType<typeof createDealStore>;
