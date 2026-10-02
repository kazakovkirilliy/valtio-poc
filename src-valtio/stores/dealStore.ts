import { proxy, ref } from "valtio";
import { effect } from "valtio-reactive";
import type { $ZodIssue } from "zod/v4/core";
import { type BroadcastFieldId, broadcastFieldIds } from "@shared/dealFields.ts";
import { type GroupType, groupTitle } from "@shared/groups.ts";
import { setValueByPath } from "@shared/lib/path.ts";
import {
  type SpotPriceStream,
  createSpotPriceStream,
} from "@shared/spotPriceStream.ts";
import { type GroupStore, createGroupStore } from "./groupStore.ts";
import { multiTabStore } from "./multiTabStore.ts";
import { clearValidationErrors } from "./validation.ts";

/**
 * Broadcast commands: written on commit, then reset to `undefined` in the
 * same tick; every product copies the value into its own field. Deal keys
 * are named after their field ids.
 */
type DealBroadcasts = Record<BroadcastFieldId, unknown>;

const createBroadcasts = () =>
  Object.fromEntries(broadcastFieldIds.map((id) => [id, undefined])) as DealBroadcasts;

export type DealStore = DealBroadcasts & {
  notionalCcy: string;
  premiumCcy: string;
  groups: Record<string, GroupStore>;
  groupIds: string[]; // display order; each group's `ui.index` mirrors it
  isInternal: boolean;
  options: {
    hedgeTypes: string[];
  };
  spotPriceStream: SpotPriceStream;
  readonly hasValidationErrors: boolean;
  validationErrors: Record<string, $ZodIssue[]>; // keyed by field path
  actions: {
    addNewGroup(groupType: GroupType): void;
    cloneGroup(groupId: string): void;
    removeGroup(groupId: string): void;
    setValueByPath(path: string, value: unknown): void;
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
    const { groupStore, dispose } = createGroupStore(dealStore, groupType, source);
    disposers.set(groupStore.id, dispose);
    // record first, so the id never appears in the order without its group
    dealStore.groups[groupStore.id] = groupStore;
    dealStore.groupIds.splice(position, 0, groupStore.id);
    reindexGroups();
  };

  const dealStore: DealStore = proxy<DealStore>({
    ...createBroadcasts(),
    notionalCcy: "1xxxxxx",
    premiumCcy: "2",
    groups: {},
    groupIds: [],
    isInternal: true,
    spotPriceStream: ref(spotPriceStream), // ref(): ticks never notify the deal proxy
    options: {
      hedgeTypes: [],
    },
    get hasValidationErrors() {
      return Object.values(dealStore.validationErrors).some((issues) => issues.length > 0);
    },
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
    },
  });

  effect(() => {
    if (multiTabStore.devtools.isSpotPriceStreamEnabled) {
      spotPriceStream.start();
    } else {
      spotPriceStream.stop();
    }
  });

  const options = dealStore.options;
  effect(() => (options.hedgeTypes = dealStore.isInternal ? ["abc"] : ["def"]));

  return dealStore;
};
