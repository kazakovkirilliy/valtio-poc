import { autorun, reaction } from "mobx";
import { type Instance, type SnapshotIn, addDisposer, getEnv, getSnapshot, isAlive, types } from "mobx-state-tree";
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
import { initialDealFields } from "@shared/dealFields.ts";
import { initialDealSettings } from "@shared/dealSettings.ts";
import { routeWrites } from "@shared/dealWrites.ts";
import { dealOptionsRequests } from "@shared/fields.ts";
import type { GroupType } from "@shared/groups.ts";
import { uuid } from "@shared/lib/uuid.ts";
import type { Option } from "@shared/options/optionsSource.ts";
import type { PathWrite } from "@shared/paths.ts";
import {
  type OptionsRequest,
  optionsRequestsOf,
  reconcileWrites,
  uniqueRequests,
} from "@shared/products/productWrites.ts";
import { createSpotPriceStream } from "@shared/spotPriceStream.ts";
import { Group, copyOfGroup, newGroup } from "./groupModel.ts";
import { optionsStore } from "./optionsStore.ts";

/** What a deal needs from the app-wide developer settings. */
export type DealDevtools = {
  readonly isSpotPriceStreamEnabled: boolean;
  readonly isAutocalcEnabled: boolean;
};

/** The deal's environment, given to the tree that holds it: `Deal.create({}, { devtools })`. */
export type DealEnv = { devtools: DealDevtools };

/**
 * A deal. Every write is a batch of dot paths, routed by the shared rules
 * and applied in one action, so every reaction (autocalc, inputs changed,
 * the grid) runs once, after the last write.
 */
export const Deal = types
  .model("Deal", {
    id: types.optional(types.identifier, uuid),
    notionalCcy: initialDealFields.notionalCcy,
    premiumCcy: initialDealFields.premiumCcy,
    notionalAmount: initialDealFields.notionalAmount,
    isInternal: initialDealSettings.isInternal,
    hedgeType: initialDealSettings.hedgeType,
    /** In display order. */
    groups: types.array(Group),
    calc: types.frozen<CalcState>(initialCalcState),
  })
  .volatile(() => ({
    /** Kept outside the tree: ticks never notify observers; the grid repaints just that cell. */
    spotPriceStream: createSpotPriceStream(),
  }))
  .views((self) => ({
    /** Every product of every group, in display order. */
    get products() {
      return self.groups.flatMap((group) => group.products.slice());
    },
    get hasValidationErrors() {
      return this.products.some((product) => product.hasValidationErrors);
    },
    /** No validation errors and no request pending: ready to calculate. */
    get isReady() {
      return isCalcReady(this.hasValidationErrors, optionsStore.pending);
    },
    /** A product and its group, by the product's id. */
    findProduct(productId: string) {
      for (const group of self.groups) {
        const product = group.products.find(({ id }) => id === productId);
        if (product) return { group, product };
      }
      return undefined;
    },
  }))
  // the steps that async results (a price, options) apply: MST only lets actions change the tree
  .actions((self) => ({
    setCalc(calc: CalcState) {
      self.calc = calc;
    },
    markInputsChanged() {
      self.calc = calcInputsChanged(self.calc);
    },
    /** Options arrived: every product still on that parameter keeps a valid value, in one action. */
    reconcileOptions(request: OptionsRequest, options: readonly Option[]) {
      for (const product of self.products) product.write(reconcileWrites(product.data, request, options));
    },
  }))
  .actions((self) => {
    const loadOptions = (requests: readonly OptionsRequest[]) => {
      for (const request of requests) {
        void optionsStore.load(request.source, request.param).then((options) => {
          // a deal destroyed meanwhile (a closed tab) has nothing to reconcile
          if (options && isAlive(self)) self.reconcileOptions(request, options);
        });
      }
    };

    const insertGroup = (group: SnapshotIn<typeof Group>, position: number) => {
      self.groups.splice(position, 0, group);
      const { products } = self.groups[position];
      loadOptions(uniqueRequests(products.flatMap(({ data }) => optionsRequestsOf(data))));
    };

    return {
      loadOptions,
      addNewGroup(groupType: GroupType) {
        insertGroup(newGroup(groupType, self), self.groups.length);
      },
      /** Inserts a copy of the group (new ids, same data) right after it. */
      cloneGroup(groupId: string) {
        const position = self.groups.findIndex(({ id }) => id === groupId);
        if (position !== -1) insertGroup(copyOfGroup(self.groups[position]), position + 1);
      },
      removeGroup(groupId: string) {
        const position = self.groups.findIndex(({ id }) => id === groupId);
        if (position !== -1) self.groups.splice(position, 1);
      },
      /** Writes values at dot paths, in order, as one action: an edit, a paste, anything. */
      writePaths(writes: readonly PathWrite[]) {
        const { notionalCcy, premiumCcy, notionalAmount, isInternal, hedgeType } = self;
        const routed = routeWrites(
          {
            dealFields: { notionalCcy, premiumCcy, notionalAmount },
            settings: { isInternal, hedgeType },
            products: self.groups.flatMap((group) =>
              group.products.map((product) => ({ groupId: group.id, productId: product.id, data: product.data })),
            ),
          },
          writes,
        );
        // same-value writes don't notify: only what changed does
        Object.assign(self, routed.dealFields, routed.settings);
        for (const [productId, { writes: productWrites }] of routed.products) {
          self.findProduct(productId)?.product.write(productWrites);
        }
        loadOptions(routed.requests);
      },
      /** Calculates now, if ready (the manual Calculate). Only the latest request's response is kept. */
      calculate() {
        if (!self.isReady) return;
        const requestId = self.calc.requestId + 1;
        self.calc = calcStarted(self.calc, requestId);
        calculatePrice(self.products.map((product) => product.data)).then(
          (price) => self.setCalc(calcSucceeded(self.calc, requestId, price)),
          () => self.setCalc(calcFailed(self.calc, requestId)),
        );
      },
    };
  })
  // lifecycle: the deal's reactions live as long as the deal; `destroy(deal)` stops them
  .actions((self) => ({
    afterCreate() {
      const { devtools } = getEnv<DealEnv>(self);
      // the deal column's own options (its default parameters), loaded with the deal
      self.loadOptions(dealOptionsRequests);
      // any product edit outdates the price (and supersedes a calculation in flight);
      // the snapshot is a new object whenever anything in the groups changed
      addDisposer(self, reaction(() => getSnapshot(self.groups), () => self.markInputsChanged()));
      // autocalc: whenever the deal is ready and its price missing or outdated. An autorun,
      // not a reaction: a calculation can be superseded in the same batch that started it
      addDisposer(
        self,
        autorun(() => {
          if (devtools.isAutocalcEnabled && self.isReady && needsAutocalc(self.calc)) self.calculate();
        }),
      );
      addDisposer(
        self,
        autorun(() => (devtools.isSpotPriceStreamEnabled ? self.spotPriceStream.start() : self.spotPriceStream.stop())),
      );
    },
    beforeDestroy() {
      self.spotPriceStream.stop();
    },
  }));

export type Deal = Instance<typeof Deal>;
