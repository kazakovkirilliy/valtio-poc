import {
  createEvent,
  createStore,
  merge,
  sample as connect,
  type Store,
} from "effector";
import {
  type BroadcastFieldId,
  type DealFieldsState,
  type SyncedFieldId,
  isEmptyBroadcast,
  isSyncedField,
} from "@shared/dealFields.ts";
import type { ProductFieldId } from "@shared/fields.ts";
import type { GroupType } from "@shared/groups.ts";
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
import { keysOf } from "./keys.ts";
import { loadAllOptionsFx, loadOptionsFx } from "./optionsStore.ts";
import {
  optionsRequestsFor,
  optionsRequestsOf,
  reconcileProductOptions,
  setProductField,
  validateProducts,
} from "./productStore.ts";

/** What a deal needs from the app-wide developer settings. */
type DealDevtools = { $isSpotPriceStreamEnabled: Store<boolean> };

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
  // --- actions: the requests the UI (or anything else) can make
  const addGroupAction = createEvent<GroupType>();
  const cloneGroupAction = createEvent<string>();
  const removeGroupAction = createEvent<string>();
  /** Writes one field of one product, addressed by its group. */
  const commitProductFieldAction = createEvent<{
    groupId: string;
    productId: string;
    fieldId: ProductFieldId;
    value: unknown;
  }>();
  /** Two-way sync: the deal value and every product's copy, in one event. */
  const commitSyncedFieldAction = createEvent<{
    fieldId: SyncedFieldId;
    value: string;
  }>();
  /** Pushes one value into every product; the deal keeps nothing. */
  const broadcastFieldAction = createEvent<{
    fieldId: BroadcastFieldId;
    value: unknown;
  }>();

  // --- state
  const $dealFields = createStore<DealFieldsState>({
    notionalCcy: "1xxxxxx",
    premiumCcy: "2",
  });
  const $groups = createStore<GroupsState>({});
  const $isInternal = createStore(true);

  // --- derived
  /** The group ids in order; changes only when groups are added or removed. */
  const $groupIds = keysOf($groups);
  const $hedgeTypes = $isInternal.map((isInternal) =>
    isInternal ? ["abc"] : ["def"],
  );
  /** Issues per product, per field — only changed products are re-validated. */
  const $validation = $groups.map((groups) => validateProducts(productsOf(groups)));
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
      source: { defaults: $dealFields, groups: $groups },
      filter: ({ groups }, groupId) => groupId in groups,
      fn: cloneGroupReducer,
    }),
  ]);
  $groups.on(groupCreated, groupCreatedReducer);
  // nothing to dispose: the group's products, and their issues, go with it
  $groups.on(removeGroupAction, groupRemovedReducer);

  // --- fields
  // a product's ccy commit is the two-way sync: it writes the deal and every product
  connect({
    clock: commitProductFieldAction,
    filter: ({ fieldId }) => isSyncedField(fieldId),
    fn: ({ fieldId, value }) => ({
      fieldId: fieldId as SyncedFieldId,
      value: String(value),
    }),
    target: commitSyncedFieldAction,
  });
  $groups.on(commitProductFieldAction, (groups, { groupId, productId, fieldId, value }) => {
    const product = productOf(groups, groupId, productId);
    if (!product || isSyncedField(fieldId)) return groups;
    // copies only the path to the product: the groups, its group, its products
    return setIn(groups, `${groupId}.products.${productId}`, setProductField(product, fieldId, value));
  });

  $dealFields.on(commitSyncedFieldAction, (deal, { fieldId, value }) =>
    deal[fieldId] === value ? deal : { ...deal, [fieldId]: value },
  );
  $groups.on(commitSyncedFieldAction, (groups, { fieldId, value }) =>
    mapProducts(groups, (product) => setProductField(product, fieldId, value)),
  );
  $groups.on(broadcastFieldAction, (groups, { fieldId, value }) => {
    if (isEmptyBroadcast(value)) return groups; // nothing to send
    return mapProducts(groups, (product) => setProductField(product, fieldId, value));
  });

  // --- async options (e.g. Fixing Source): each depends on another product field
  // load them for a new group's products (one request per source and parameter) …
  connect({
    clock: groupCreated,
    fn: ({ group }) => optionsRequestsOf(Object.values(group.products)),
    target: loadAllOptionsFx,
  });
  // … and reload them whenever that field changes, in one product or broadcast to all
  connect({
    clock: commitProductFieldAction,
    fn: ({ fieldId, value }) => optionsRequestsFor(fieldId, value),
    target: loadAllOptionsFx,
  });
  connect({
    clock: broadcastFieldAction,
    filter: ({ value }) => !isEmptyBroadcast(value),
    fn: ({ fieldId, value }) => optionsRequestsFor(fieldId, value),
    target: loadAllOptionsFx,
  });
  // options arrived: products still on that parameter keep their value if it's
  // an option, else take the first (stale responses: ignored)
  $groups.on(loadOptionsFx.done, (groups, { params, result }) =>
    mapProducts(groups, (product) => reconcileProductOptions(product, params, result)),
  );

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
      commitProductFieldAction,
      commitSyncedFieldAction,
      broadcastFieldAction,
    },
    // stores
    $dealFields,
    $groups,
    $groupIds,
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
