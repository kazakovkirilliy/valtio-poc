import { autorun, observable, reaction } from "mobx";
import {
  type BroadcastFieldId,
  type SyncedFieldId,
  broadcastFieldIds,
} from "./dealFields.ts";
import { type FieldModel, createFieldModel } from "./fieldModel.ts";
import type { FieldId } from "./fields.ts";
import {
  type GroupStore,
  type GroupType,
  createGroupStore,
  groupDefinitions,
} from "./groupStore.ts";
import type { AnyProduct } from "./products/productRegistry.ts";
import { settlementStyleStore } from "./settlementStyleStore.ts";
import {
  type SpotPriceStream,
  createSpotPriceStream,
} from "./spotPriceStream.ts";

/** What a deal needs from the app-wide developer settings. */
type DealDevtools = { readonly isSpotPriceStreamEnabled: boolean };

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
  readonly products: AnyProduct[];
  readonly hasValidationErrors: boolean;
  addNewGroup(groupType: GroupType): void;
  cloneGroup(groupId: string): void;
  removeGroup(groupId: string): void;
  setSynced(id: SyncedFieldId, value: string): void;
  broadcast(id: BroadcastFieldId, value: unknown): void;
  applyDefaultSettlementStyle(value: string): void;
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
      group.ui.title = `${groupDefinitions[group.groupType].label} #${index + 1}`;
    });
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
  };

  /**
   * The deal column's fields. Notional/Premium Ccy show the deal value and
   * commit through the two-way sync. Every other field is a broadcast: it
   * holds nothing (shows empty) and commits into every product.
   */
  const fields: Partial<Record<FieldId, FieldModel>> = {
    notionalCcy: createFieldModel({
      read: () => deal.notionalCcy,
      commit: (value) => deal.setSynced("notionalCcy", String(value)),
    }),
    premiumCcy: createFieldModel({
      read: () => deal.premiumCcy,
      commit: (value) => deal.setSynced("premiumCcy", String(value)),
    }),
    ...Object.fromEntries(
      broadcastFieldIds.map((id) => [
        id,
        createFieldModel({
          read: () => undefined,
          commit: (value) => {
            if (value === "" || Number.isNaN(value)) return; // nothing to send
            deal.broadcast(id, value);
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
      /** Gives every product with no settlement style the default one. */
      applyDefaultSettlementStyle(value) {
        deal.products.forEach((product) => {
          if (!product.fields.settlementStyle.value) {
            product.setField("settlementStyle", value);
          }
        });
      },
      dispose() {
        stopSpotPriceStream();
        stopDefaultSettlementStyle();
        spotPriceStream.stop();
      },
    },
    { spotPriceStream: false, fields: false, dispose: false },
    { autoBind: true },
  );

  const stopSpotPriceStream = autorun(() =>
    devtools.isSpotPriceStreamEnabled
      ? spotPriceStream.start()
      : spotPriceStream.stop(),
  );

  /**
   * Default Settlement Style: when the options load, every product still
   * without one gets the first option. Products created later start with it.
   */
  const stopDefaultSettlementStyle = reaction(
    () => settlementStyleStore.firstValue,
    (value) => value && deal.applyDefaultSettlementStyle(value),
  );

  return deal;
};
