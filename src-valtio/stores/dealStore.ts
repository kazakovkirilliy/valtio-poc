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
import {
  type BroadcastFieldId,
  type DealFieldsState,
  broadcastFieldIds,
  initialDealFields,
} from "@shared/dealFields.ts";
import { dealOptionsRequests } from "@shared/fields.ts";
import {
  type DealSettingId,
  type DealSettingsState,
  hedgeTypesFor,
  initialDealSettings,
  withSetting,
} from "@shared/dealSettings.ts";
import { type GroupType, groupTitle } from "@shared/groups.ts";
import { setValueByPath } from "@shared/lib/path.ts";
import {
  type SpotPriceStream,
  createSpotPriceStream,
} from "@shared/spotPriceStream.ts";
import { type GroupStore, createGroupStore } from "./groupStore.ts";
import { multiTabStore } from "./multiTabStore.ts";
import { optionsStore } from "./optionsStore.ts";
import { clearValidationErrors } from "./validation.ts";

/**
 * Broadcast commands: written on commit, then reset to `undefined` in the
 * same tick; every product copies the value into its own field. Deal keys
 * are named after their field ids.
 */
type DealBroadcasts = Record<BroadcastFieldId, unknown>;

const createBroadcasts = () =>
  Object.fromEntries(
    broadcastFieldIds.map((id) => [id, undefined]),
  ) as DealBroadcasts;

export type DealStore = DealBroadcasts &
  DealFieldsState &
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
      setValueByPath(path: string, value: unknown): void;
      /** Calculates now, if ready (the manual Calculate). */
      calculate(): void;
      /** Sets a deal setting (internal, hedge type); a hedge type stays one of its options. */
      setSetting(id: DealSettingId, value: unknown): void;
    };
  };

export const createDealStore = (): DealStore => {
  const spotPriceStream = createSpotPriceStream();

  // kept outside the proxy: functions, never rendered or snapshotted
  const disposers = new Map<string, () => void>();

  /** Re-derives every group's index and title from its position. */
  const reindexGroups = () => {
    dealStore.groupIds.forEach((groupId, index) => {
      const group = dealStore.groups[groupId];
      // same-value writes are ignored, so unmoved groups don't notify
      group.ui.index = index;
      group.ui.title = groupTitle(group.groupType, index);
    });
  };

  const insertGroup = (
    groupType: GroupType,
    position: number,
    source?: GroupStore,
  ) => {
    const { groupStore, dispose } = createGroupStore(
      dealStore,
      groupType,
      source,
    );
    disposers.set(groupStore.id, dispose);
    // record first, so the id never appears in the order without its group
    dealStore.groups[groupStore.id] = groupStore;
    dealStore.groupIds.splice(position, 0, groupStore.id);
    reindexGroups();
  };

  const dealStore: DealStore = proxy<DealStore>({
    ...createBroadcasts(),
    ...initialDealFields,
    groups: {},
    groupIds: [],
    ...initialDealSettings,
    spotPriceStream: ref(spotPriceStream), // ref(): ticks never notify the deal proxy
    options: {
      hedgeTypes: [],
    },
    get hasValidationErrors() {
      return Object.values(dealStore.validationErrors).some(
        (issues) => issues.length > 0,
      );
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
      setValueByPath(path: string, value: unknown) {
        setValueByPath(dealStore, path, value);
      },
      setSetting(id: DealSettingId, value: unknown) {
        Object.assign(dealStore, withSetting(dealStore, id, value));
      },
      calculate() {
        if (!dealStore.isReady) return;
        const requestId = dealStore.calc.requestId + 1;
        dealStore.calc = calcStarted(dealStore.calc, requestId);
        const products = dealStore.groupIds.flatMap((groupId) => {
          const group = dealStore.groups[groupId];
          return group.productIds.map(
            (productId) => group.products[productId].data,
          );
        });
        calculatePrice(products).then(
          (price) =>
            (dealStore.calc = calcSucceeded(dealStore.calc, requestId, price)),
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
  dealOptionsRequests.forEach(
    ({ source, param }) => void optionsStore.actions.load(source, param),
  );

  // any product edit outdates the price (and supersedes a calculation in flight)
  subscribe(
    dealStore.groups,
    () => (dealStore.calc = calcInputsChanged(dealStore.calc)),
    true,
  );
  // autocalc: whenever the deal is ready and its price missing or outdated.
  // Explicit subscriptions, not an `effect`: valtio-reactive only tracks
  // proxies created after it loads, which the options and devtools stores
  // may not be. Notified after the write has reached every listener, so an
  // edit's validation has run by the time this checks.
  const autocalc = () => {
    if (
      multiTabStore.devtools.isAutocalcEnabled &&
      dealStore.isReady &&
      needsAutocalc(dealStore.calc)
    ) {
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
