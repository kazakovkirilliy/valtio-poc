import { autorun, makeAutoObservable } from "mobx";
import type { FieldId } from "../fields/fields.ts";
import type { FieldModel } from "../fields/FieldModel.ts";
import {
  type GroupType,
  GroupStore,
  groupDefinitions,
} from "../groups/groupStore.ts";
import type {
  BroadcastFieldId,
  OptionProduct,
  SyncedFieldId,
} from "../products/optionProduct.ts";
import { createDealFields } from "./dealFields.ts";
import { createSpotPriceStream } from "./spotPriceStream.ts";

/** What a deal needs from the app-wide developer settings. */
type DealDevtools = { readonly isSpotPriceStreamEnabled: boolean };

/**
 * Syncs and broadcasts are actions that write every product directly, and
 * derived values (expiry days, validation) are computeds: there is no
 * subscription graph to wire up, order, or dispose.
 */
export class DealStore {
  notionalCcy = "1xxxxxx";
  premiumCcy = "2";
  groups: Record<string, GroupStore> = {};
  groupIds: string[] = []; // display order; each group's `ui.index` mirrors it
  isInternal = true;

  /** Kept outside MobX: ticks never notify observers (see SpotPriceField). */
  readonly spotPriceStream = createSpotPriceStream();
  /** One model per deal field, for the inputs. */
  readonly fields: Partial<Record<FieldId, FieldModel>>;
  readonly dispose: () => void;

  constructor(devtools: DealDevtools) {
    this.fields = createDealFields(this);

    makeAutoObservable(
      this,
      { spotPriceStream: false, fields: false, dispose: false },
      { autoBind: true },
    );

    const stopSpotPriceStream = autorun(() =>
      devtools.isSpotPriceStreamEnabled
        ? this.spotPriceStream.start()
        : this.spotPriceStream.stop(),
    );
    this.dispose = () => {
      stopSpotPriceStream();
      this.spotPriceStream.stop();
    };
  }

  get hedgeTypes() {
    return this.isInternal ? ["abc"] : ["def"];
  }

  /** Every product of every group, in display order. */
  get products(): OptionProduct[] {
    return this.groupIds.flatMap((groupId) => this.groups[groupId].productList);
  }

  get hasValidationErrors() {
    return this.products.some((product) => product.hasValidationErrors);
  }

  addNewGroup(groupType: GroupType) {
    this.insertGroup(groupType, this.groupIds.length);
  }

  /** Inserts a copy of the group (and its products) right after it. */
  cloneGroup(groupId: string) {
    const position = this.groupIds.indexOf(groupId);
    if (position === -1) return;
    const source = this.groups[groupId];
    this.insertGroup(source.groupType, position + 1, source);
  }

  /** Nothing to dispose: the group's computeds go with it. */
  removeGroup(groupId: string) {
    const position = this.groupIds.indexOf(groupId);
    if (position === -1) return;
    // order first, so the id never appears without its group
    this.groupIds.splice(position, 1);
    delete this.groups[groupId];
    this.reindexGroups();
  }

  /** Two-way sync, as one action: the deal value and every product's copy. */
  setSynced(id: SyncedFieldId, value: string) {
    this[id] = value;
    this.products.forEach((product) => product.setField(id, value));
  }

  /** Pushes one value into every product; the deal keeps nothing. */
  broadcast(id: BroadcastFieldId, value: unknown) {
    this.products.forEach((product) => product.setField(id, value));
  }

  private insertGroup(
    groupType: GroupType,
    position: number,
    source?: GroupStore,
  ) {
    const group = new GroupStore(groupType, this, source);
    // record first, so the id never appears in the order without its group
    this.groups[group.id] = group;
    this.groupIds.splice(position, 0, group.id);
    this.reindexGroups();
  }

  /** Re-derives every group's index and title from its position. */
  private reindexGroups() {
    this.groupIds.forEach((groupId, index) => {
      const group = this.groups[groupId];
      group.ui.index = index;
      group.ui.title = `${groupDefinitions[group.groupType].label} #${index + 1}`;
    });
  }
}
