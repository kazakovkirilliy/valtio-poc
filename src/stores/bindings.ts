import type { DealActions, FieldPath, Issues, WorkspaceActions } from "./domain.ts";
import type { SpotPriceStream } from "./spotPriceStream.ts";

/** Only the view contract is shared. Each implementation uses its native React hooks. */
export type StoreBindings = {
  useWorkspace(): {
    dealIds: readonly string[];
    activeDealId: string;
    streamEnabled: boolean;
    actions: WorkspaceActions;
  };
  useProductIds(dealId: string): readonly string[];
  useField(dealId: string, path: FieldPath): { value: string; issues: Issues };
  useDealMeta(dealId: string): {
    isInternal: boolean;
    hedgeTypes: readonly string[];
    hasValidationErrors: boolean;
  };
  getDealActions(dealId: string): DealActions;
  getSpotPriceStream(dealId: string): SpotPriceStream;
  connectStreams(): () => void;
};
