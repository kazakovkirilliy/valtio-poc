import type { FieldId } from "../fields/fields.ts";
import { type FieldModel, noIssues } from "../fields/FieldModel.ts";
import {
  type BroadcastFieldId,
  type SyncedFieldId,
  broadcastFieldIds,
} from "../products/optionProduct.ts";
import type { DealStore } from "./dealStore.ts";

/**
 * The deal column's fields. Notional/Premium Ccy show the deal value and
 * commit through the two-way sync. Every other product field is a
 * broadcast: it holds nothing (shows empty) and commits by pushing the value
 * into every product of every group.
 */
export const createDealFields = (
  deal: DealStore,
): Partial<Record<FieldId, FieldModel>> => {
  const synced = (id: SyncedFieldId): FieldModel => ({
    get value() {
      return deal[id];
    },
    issues: noIssues,
    commit: (value) => deal.setSynced(id, String(value)),
  });

  const broadcast = (id: BroadcastFieldId): FieldModel => ({
    value: undefined,
    issues: noIssues,
    commit: (value) => {
      if (value === "" || Number.isNaN(value)) return; // nothing to broadcast
      deal.broadcast(id, value);
    },
  });

  return {
    notionalCcy: synced("notionalCcy"),
    premiumCcy: synced("premiumCcy"),
    ...Object.fromEntries(broadcastFieldIds.map((id) => [id, broadcast(id)])),
  };
};
