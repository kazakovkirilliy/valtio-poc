import type { DealActions, FieldTarget, FieldValue, GroupSummary, Issues, WorkspaceActions } from "./domain.ts";
import type { SpotPriceStream } from "./spotPriceStream.ts";

/** Shared view only; state and React subscriptions remain native to each library. */
export type StoreBindings = {
  useWorkspace(): {
    dealIds: readonly string[];
    activeDealId: string;
    streamEnabled: boolean;
    actions: WorkspaceActions;
  };
  useGroupIds(dealId: string): readonly string[];
  useGroup(dealId: string, groupId: string): GroupSummary | undefined;
  useField(dealId: string, target: FieldTarget): { value: FieldValue; issues: Issues };
  useDealMeta(dealId: string): {
    isInternal: boolean;
    hedgeTypes: readonly string[];
    hasValidationErrors: boolean;
  };
  getDealActions(dealId: string): DealActions;
  getSpotPriceStream(dealId: string): SpotPriceStream;
  connectStreams(): () => void;
};
