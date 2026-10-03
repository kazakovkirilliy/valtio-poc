import { proxy, ref, subscribe } from "valtio";
import { subscribeKey } from "valtio/utils";
import { effect } from "valtio-reactive";
import type { $ZodIssue } from "zod/v4/core";
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
import { type GroupType, groupTitle } from "@shared/groups.ts";
import { deleteValueByPath, setValueByPath } from "@shared/lib/path.ts";
import type { PathWrite } from "@shared/paths.ts";
import type { ProductData } from "@shared/products/productRegistry.ts";
import {
  type OptionsRequest,
  type ProductWrite,
  optionsRequestsOf,
  planProductWrites,
  reconcileWrites,
  uniqueRequests,
} from "@shared/products/productWrites.ts";
import { type SpotPriceStream, createSpotPriceStream } from "@shared/spotPriceStream.ts";
import { type GroupStore, createGroupStore } from "./groupStore.ts";
import { multiTabStore } from "./multiTabStore.ts";
import { optionsStore } from "./optionsStore.ts";
import { clearValidationErrors } from "./validation.ts";

export type DealStore = DealFieldsState &
  DealSettingsState & {
    groups: Record<string, GroupStore>;
    groupIds: string[]; // display order; each group's `ui.index` mirrors it
    options: {
      hedgeTypes: readonly string[];
    };
    spotPriceStream: SpotPriceStream;
    readonly hasValidationErrors: boolean;
    /** No validation errors and no request pending: ready to calculate. */
    readonly isReady: boolean;
    calc: CalcState;
    validationErrors: Record<string, $ZodIssue[]>; // keyed by field path
    actions: {
      addNewGroup(groupType: GroupType): void;
      cloneGroup(groupId: string): void;
      removeGroup(groupId: string): void;
      /** Writes values at dot paths, in order: an edit, a paste, anything. */
      writePaths(writes: readonly PathWrite[]): void;
      /** Calculates now, if ready (the manual Calculate). */
      calculate(): void;
    };
  };

/**
 * Deal factory. Every write is a batch of dot paths, routed by the shared
 * rules and applied as plain proxy assignments, leaf by leaf: valtio has no
 * transactions, so the deal's sync subscriptions (validation, inputs
 * changed) run as each one lands, while async ones (the grid, autocalc)
 * see the whole batch a tick later.
 */
export const createDealStore = (): DealStore => {
  const spotPriceStream = createSpotPriceStream();

  // kept outside the proxy: functions, never rendered or snapshotted
  const disposers = new Map<string, () => void>();

  /** Every product with where it lives, in display order. */
  const dealProducts = (): DealProduct[] =>
    dealStore.groupIds.flatMap((groupId) => {
      const group = dealStore.groups[groupId];
      return group.productIds.map((productId) => ({ groupId, productId, data: group.products[productId].data }));
    });

  /** Writes into a live product's data, leaf by leaf, by the shared rules. */
  const applyProductWrites = (data: ProductData, writes: readonly ProductWrite[]) => {
    for (const change of planProductWrites(data, writes).changes) {
      if ("remove" in change) deleteValueByPath(data, change.path);
      else setValueByPath(data, change.path, change.value);
    }
  };

  /** Loads options; when they arrive, every product still on that parameter reconciles. */
  const loadOptions = (requests: readonly OptionsRequest[]) => {
    for (const request of requests) {
      void optionsStore.actions.load(request.source, request.param).then((options) => {
        if (!options) return;
        for (const { data } of dealProducts()) applyProductWrites(data, reconcileWrites(data, request, options));
      });
    }
  };

  /** Re-derives every group's index and title from its position. */
  const reindexGroups = () => {
    dealStore.groupIds.forEach((groupId, index) => {
      const group = dealStore.groups[groupId];
      // same-value writes are ignored, so unmoved groups don't notify
      group.ui.index = index;
      group.ui.title = groupTitle(group.groupType, index);
    });
  };

  const insertGroup = (groupType: GroupType, position: number, source?: GroupStore) => {
    const { groupStore, dispose } = createGroupStore(dealStore, groupType, source);
    disposers.set(groupStore.id, dispose);
    // record first, so the id never appears in the order without its group
    dealStore.groups[groupStore.id] = groupStore;
    dealStore.groupIds.splice(position, 0, groupStore.id);
    reindexGroups();
    const products = groupStore.productIds.map((productId) => groupStore.products[productId].data);
    loadOptions(uniqueRequests(products.flatMap(optionsRequestsOf)));
  };

  const dealStore: DealStore = proxy<DealStore>({
    ...initialDealFields,
    groups: {},
    groupIds: [],
    ...initialDealSettings,
    spotPriceStream: ref(spotPriceStream), // ref(): ticks never notify the deal proxy
    options: {
      hedgeTypes: [],
    },
    get hasValidationErrors() {
      return Object.values(dealStore.validationErrors).some((issues) => issues.length > 0);
    },
    get isReady() {
      return isCalcReady(dealStore.hasValidationErrors, optionsStore.pending);
    },
    calc: initialCalcState,
    validationErrors: {},
    actions: {
      addNewGroup(groupType: GroupType) {
        insertGroup(groupType, dealStore.groupIds.length);
      },
      /** Inserts a copy of the group (and its products) right after it. */
      cloneGroup(groupId: string) {
        const position = dealStore.groupIds.indexOf(groupId);
        if (position === -1) return;
        const source = dealStore.groups[groupId];
        insertGroup(source.groupType, position + 1, source);
      },
      removeGroup(groupId: string) {
        const position = dealStore.groupIds.indexOf(groupId);
        if (position === -1) return;

        disposers.get(groupId)?.();
        disposers.delete(groupId);

        // order first, so the id never appears without its group
        dealStore.groupIds.splice(position, 1);
        delete dealStore.groups[groupId];
        clearValidationErrors(dealStore, `groups.${groupId}`);

        reindexGroups();
      },
      writePaths(writes: readonly PathWrite[]) {
        const { notionalCcy, premiumCcy, notionalAmount, isInternal, hedgeType } = dealStore;
        const routed = routeWrites(
          {
            dealFields: { notionalCcy, premiumCcy, notionalAmount },
            settings: { isInternal, hedgeType },
            products: dealProducts(),
          },
          writes,
        );
        // same-value writes are ignored: only what changed notifies
        Object.assign(dealStore, routed.dealFields, routed.settings);
        for (const [productId, { groupId, writes: productWrites }] of routed.products) {
          applyProductWrites(dealStore.groups[groupId].products[productId].data, productWrites);
        }
        loadOptions(routed.requests);
      },
      calculate() {
        if (!dealStore.isReady) return;
        const requestId = dealStore.calc.requestId + 1;
        dealStore.calc = calcStarted(dealStore.calc, requestId);
        calculatePrice(dealProducts().map(({ data }) => data)).then(
          (price) => (dealStore.calc = calcSucceeded(dealStore.calc, requestId, price)),
          () => (dealStore.calc = calcFailed(dealStore.calc, requestId)),
        );
      },
    },
  });

  effect(() => {
    if (multiTabStore.devtools.isSpotPriceStreamEnabled) {
      spotPriceStream.start();
    } else {
      spotPriceStream.stop();
    }
  });

  // the deal column's own options (its default parameters), loaded with the deal
  loadOptions(dealOptionsRequests);

  // any product edit outdates the price (and supersedes a calculation in flight)
  subscribe(dealStore.groups, () => (dealStore.calc = calcInputsChanged(dealStore.calc)), true);
  // autocalc: whenever the deal is ready and its price missing or outdated.
  // Explicit subscriptions, not an `effect`: valtio-reactive only tracks
  // proxies created after it loads, which the options and devtools stores
  // may not be. Notified after the write has reached every listener, so an
  // edit's validation has run by the time this checks.
  const autocalc = () => {
    if (multiTabStore.devtools.isAutocalcEnabled && dealStore.isReady && needsAutocalc(dealStore.calc)) {
      dealStore.actions.calculate();
    }
  };
  subscribeKey(dealStore, "calc", autocalc);
  subscribe(dealStore.validationErrors, autocalc);
  subscribeKey(optionsStore, "pending", autocalc);
  subscribeKey(multiTabStore.devtools, "isAutocalcEnabled", autocalc);

  const options = dealStore.options;
  effect(() => (options.hedgeTypes = hedgeTypesFor(dealStore.isInternal)));

  return dealStore;
};
