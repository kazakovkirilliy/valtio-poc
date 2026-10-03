import {
  autorun,
  observable,
  observableRef,
  reaction,
  runInAction,
} from "mobx";
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
import { type GroupType, groupTitle } from "@shared/groups.ts";
import {
  type SpotPriceStream,
  createSpotPriceStream,
} from "@shared/spotPriceStream.ts";
import { type GroupStore, createGroupStore } from "./groupStore.ts";
import { optionsStore } from "./optionsStore.ts";
import type { Product } from "./productStore.ts";

/** What a deal needs from the app-wide developer settings. */
type DealDevtools = {
  readonly isSpotPriceStreamEnabled: boolean;
  readonly isAutocalcEnabled: boolean;
};

export type DealStore = DealFieldsState & DealSettingsState & {
  groups: Record<string, GroupStore>;
  groupIds: string[]; // display order; each group's `ui.index` mirrors it
  /** Kept outside MobX: ticks never notify observers; the grid repaints just that cell. */
  readonly spotPriceStream: SpotPriceStream;
  readonly hedgeTypes: readonly string[];
  /** Every product of every group, in display order. */
  readonly products: Product[];
  readonly hasValidationErrors: boolean;
  calc: CalcState;
  /** No validation errors and no request pending: ready to calculate. */
  readonly isReady: boolean;
  addNewGroup(groupType: GroupType): void;
  cloneGroup(groupId: string): void;
  removeGroup(groupId: string): void;
  /** Writes values at dot paths, in order, as one action: an edit, a paste, anything. */
  writePaths(writes: readonly PathWrite[]): void;
  /** Calculates now, if ready (the manual Calculate). */
  calculate(): void;
  markInputsChanged(): void;
  dispose(): void;
};

/**
 * Deal factory. Every write is a batch of dot paths, routed by the shared
 * rules and applied in one action, so every reaction (autocalc, inputs
 * changed, the grid) runs once, after the last write. Derived values (expiry
 * days, validation) are computeds: nothing to wire up, order, or dispose.
 */
export const createDealStore = (devtools: DealDevtools): DealStore => {
  const spotPriceStream = createSpotPriceStream();

  /** Re-derives every group's index and title from its position. */
  const reindexGroups = () => {
    deal.groupIds.forEach((groupId, index) => {
      const group = deal.groups[groupId];
      group.ui.index = index;
      group.ui.title = groupTitle(group.groupType, index);
    });
  };

  /** Writes into a live product's data, leaf by leaf, by the shared rules (derived fields are computeds). */
  const applyProductWrites = (data: ProductData, writes: readonly ProductWrite[]) => {
    for (const change of planProductWrites(data, writes).changes) {
      if ("remove" in change) deleteValueByPath(data, change.path);
      else if (!change.derived) setValueByPath(data, change.path, change.value);
    }
  };

  /** Loads options; when they arrive, every product still on that parameter reconciles. */
  const loadOptions = (requests: readonly OptionsRequest[]) => {
    for (const request of requests) {
      void optionsStore.load(request.source, request.param).then((options) => {
        if (!options) return;
        // after an `await` we're outside the action: wrap the writes
        runInAction(() => {
          for (const { data } of deal.products) applyProductWrites(data, reconcileWrites(data, request, options));
        });
      });
    }
  };

  const insertGroup = (
    groupType: GroupType,
    position: number,
    source?: GroupStore,
  ) => {
    const group = createGroupStore(groupType, deal, source);
    // record first, so the id never appears in the order without its group
    deal.groups[group.id] = group;
    deal.groupIds.splice(position, 0, group.id);
    reindexGroups();
    loadOptions(uniqueRequests(group.productList.flatMap(({ data }) => optionsRequestsOf(data))));
  };

  const deal: DealStore = observable<DealStore>(
    {
      ...initialDealFields,
      groups: {},
      groupIds: [],
      ...initialDealSettings,
      spotPriceStream,
      get hedgeTypes() {
        return hedgeTypesFor(deal.isInternal);
      },
      get products() {
        return deal.groupIds.flatMap(
          (groupId) => deal.groups[groupId].productList,
        );
      },
      get hasValidationErrors() {
        return deal.products.some((product) => product.hasValidationErrors);
      },
      calc: initialCalcState,
      get isReady() {
        return isCalcReady(deal.hasValidationErrors, optionsStore.pending);
      },
      addNewGroup(groupType) {
        insertGroup(groupType, deal.groupIds.length);
      },
      /** Inserts a copy of the group (and its products) right after it. */
      cloneGroup(groupId) {
        const position = deal.groupIds.indexOf(groupId);
        if (position === -1) return;
        const source = deal.groups[groupId];
        insertGroup(source.groupType, position + 1, source);
      },
      /** Nothing to dispose: the group's computeds go with it. */
      removeGroup(groupId) {
        const position = deal.groupIds.indexOf(groupId);
        if (position === -1) return;
        // order first, so the id never appears without its group
        deal.groupIds.splice(position, 1);
        delete deal.groups[groupId];
        reindexGroups();
      },
      writePaths(writes) {
        const products: DealProduct[] = deal.groupIds.flatMap((groupId) =>
          deal.groups[groupId].productList.map((product) => ({ groupId, productId: product.id, data: product.data })),
        );
        const { notionalCcy, premiumCcy, notionalAmount, isInternal, hedgeType } = deal;
        const routed = routeWrites(
          { dealFields: { notionalCcy, premiumCcy, notionalAmount }, settings: { isInternal, hedgeType }, products },
          writes,
        );
        // same-value writes don't notify: only what changed does
        Object.assign(deal, routed.dealFields, routed.settings);
        for (const [productId, { groupId, writes: productWrites }] of routed.products) {
          applyProductWrites(deal.groups[groupId].products[productId].data, productWrites);
        }
        loadOptions(routed.requests);
      },
      calculate() {
        if (!deal.isReady) return;
        const requestId = deal.calc.requestId + 1;
        deal.calc = calcStarted(deal.calc, requestId);
        calculatePrice(deal.products.map((product) => product.data)).then(
          (price) =>
            runInAction(
              () => (deal.calc = calcSucceeded(deal.calc, requestId, price)),
            ),
          () =>
            runInAction(() => (deal.calc = calcFailed(deal.calc, requestId))),
        );
      },
      markInputsChanged() {
        deal.calc = calcInputsChanged(deal.calc);
      },
      dispose() {
        stopSpotPriceStream();
        stopInputsReaction();
        stopAutocalc();
        spotPriceStream.stop();
      },
    },
    { spotPriceStream: false, dispose: false, calc: observableRef },
    { autoBind: true },
  );

  // the deal column's own options (its default parameters), loaded with the deal
  loadOptions(dealOptionsRequests);

  // any product edit outdates the price (and supersedes a calculation in flight);
  // serializing reads, so tracks, every field of every product
  const stopInputsReaction = reaction(
    () => JSON.stringify(deal.products.map((product) => product.data)),
    () => deal.markInputsChanged(),
  );
  // autocalc: whenever the deal is ready and its price missing or outdated.
  // An autorun, not a reaction: a calculation can be superseded in the same
  // batch that started it, leaving the condition true → true, which a
  // reaction would not fire for. Run as an action: writable, and untracked.
  const stopAutocalc = autorun(() => {
    if (
      devtools.isAutocalcEnabled &&
      deal.isReady &&
      needsAutocalc(deal.calc)
    ) {
      runInAction(() => deal.calculate());
    }
  });

  const stopSpotPriceStream = autorun(() =>
    devtools.isSpotPriceStreamEnabled
      ? spotPriceStream.start()
      : spotPriceStream.stop(),
  );

  return deal;
};
