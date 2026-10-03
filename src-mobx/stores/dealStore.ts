import { autorun, observable, observableRef, reaction, runInAction } from "mobx";
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
  type SyncedFieldId,
  broadcastFieldIds,
  isEmptyBroadcast,
  syncedFieldIds,
} from "@shared/dealFields.ts";
import { type FieldId, dealOptionsRequests } from "@shared/fields.ts";
import { type GroupType, groupTitle } from "@shared/groups.ts";
import {
  type SpotPriceStream,
  createSpotPriceStream,
} from "@shared/spotPriceStream.ts";
import { type FieldModel, createFieldModel } from "./fieldModel.ts";
import { type GroupStore, createGroupStore } from "./groupStore.ts";
import { optionsStore } from "./optionsStore.ts";
import type { Product } from "./productStore.ts";

/** What a deal needs from the app-wide developer settings. */
type DealDevtools = {
  readonly isSpotPriceStreamEnabled: boolean;
  readonly isAutocalcEnabled: boolean;
};

export type DealStore = {
  notionalCcy: string;
  premiumCcy: string;
  groups: Record<string, GroupStore>;
  groupIds: string[]; // display order; each group's `ui.index` mirrors it
  isInternal: boolean;
  /** Kept outside MobX: ticks never notify observers (see SpotPriceField). */
  readonly spotPriceStream: SpotPriceStream;
  /** One model per deal field, for the inputs. */
  readonly fields: Partial<Record<FieldId, FieldModel>>;
  readonly hedgeTypes: string[];
  /** Every product of every group, in display order. */
  readonly products: Product[];
  readonly hasValidationErrors: boolean;
  calc: CalcState;
  /** No validation errors and no request pending: ready to calculate. */
  readonly isReady: boolean;
  addNewGroup(groupType: GroupType): void;
  cloneGroup(groupId: string): void;
  removeGroup(groupId: string): void;
  setSynced(id: SyncedFieldId, value: string): void;
  broadcast(id: BroadcastFieldId, value: unknown): void;
  /** Calculates now, if ready (the manual Calculate). */
  calculate(): void;
  markInputsChanged(): void;
  dispose(): void;
};

/**
 * Deal factory. Syncs and broadcasts are actions that write every product
 * directly, and derived values (expiry days, validation) are computeds:
 * there is no subscription graph to wire up, order, or dispose.
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

  const insertGroup = (groupType: GroupType, position: number, source?: GroupStore) => {
    const group = createGroupStore(groupType, deal, source);
    // record first, so the id never appears in the order without its group
    deal.groups[group.id] = group;
    deal.groupIds.splice(position, 0, group.id);
    reindexGroups();
  };

  /**
   * The deal column's fields. Synced ones show the deal value and commit
   * through the two-way sync. Broadcasts hold nothing (show empty) and
   * commit into every product.
   */
  const fields: Partial<Record<FieldId, FieldModel>> = {
    ...Object.fromEntries(
      syncedFieldIds.map((id) => [
        id,
        createFieldModel({
          read: () => deal[id],
          commit: (value) => deal.setSynced(id, String(value)),
        }),
      ]),
    ),
    ...Object.fromEntries(
      broadcastFieldIds.map((id) => [
        id,
        createFieldModel({
          read: () => undefined,
          commit: (value) => {
            if (!isEmptyBroadcast(value)) deal.broadcast(id, value);
          },
        }),
      ]),
    ),
  };

  const deal: DealStore = observable<DealStore>(
    {
      notionalCcy: "1xxxxxx",
      premiumCcy: "2",
      groups: {},
      groupIds: [],
      isInternal: true,
      spotPriceStream,
      fields,
      get hedgeTypes() {
        return deal.isInternal ? ["abc"] : ["def"];
      },
      get products() {
        return deal.groupIds.flatMap((groupId) => deal.groups[groupId].productList);
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
      /** Two-way sync, as one action: the deal value and every product's copy. */
      setSynced(id, value) {
        deal[id] = value;
        deal.products.forEach((product) => product.setField(id, value));
      },
      /** Pushes one value into every product; the deal keeps nothing. */
      broadcast(id, value) {
        deal.products.forEach((product) => product.setField(id, value));
      },
      calculate() {
        if (!deal.isReady) return;
        const requestId = deal.calc.requestId + 1;
        deal.calc = calcStarted(deal.calc, requestId);
        calculatePrice(deal.products.map((product) => product.data)).then(
          (price) => runInAction(() => (deal.calc = calcSucceeded(deal.calc, requestId, price))),
          () => runInAction(() => (deal.calc = calcFailed(deal.calc, requestId))),
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
    { spotPriceStream: false, fields: false, dispose: false, calc: observableRef },
    { autoBind: true },
  );

  // the deal column's own options (its default parameters), loaded with the deal
  dealOptionsRequests.forEach(({ source, param }) => void optionsStore.load(source, param));

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
    if (devtools.isAutocalcEnabled && deal.isReady && needsAutocalc(deal.calc)) {
      runInAction(() => deal.calculate());
    }
  });

  const stopSpotPriceStream = autorun(() =>
    devtools.isSpotPriceStreamEnabled ? spotPriceStream.start() : spotPriceStream.stop(),
  );

  return deal;
};
