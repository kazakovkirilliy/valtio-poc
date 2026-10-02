import type { ProductFieldId } from "./fields.ts";

/**
 * How the deal shares fields with its products.
 * - synced: the deal value and every product's copy move together (two-way).
 * - broadcast: the deal holds nothing; a commit pushes the value into every
 *   product of every group.
 * Each product maps these field ids to its own paths.
 */
export const syncedFieldIds = ["notionalCcy", "premiumCcy"] as const;
export type SyncedFieldId = (typeof syncedFieldIds)[number];

export const isSyncedField = (id: string): id is SyncedFieldId =>
  (syncedFieldIds as readonly string[]).includes(id);

export const broadcastFieldIds = [
  "strike",
  "callPut",
  "buySell",
  "ccyPair",
  "deliveryDate",
  "expiryCut",
  "expiryDate",
  "premiumDate",
  "notionalAmount",
  "settlementStyle",
  "settlementCcy",
  "settlementFixingSource",
] as const satisfies readonly ProductFieldId[];
export type BroadcastFieldId = (typeof broadcastFieldIds)[number];

/** The deal's own values: the synced fields. New products start from them. */
export type DealFieldsState = Record<SyncedFieldId, string>;

/** A broadcast commit carries nothing when the input was left empty. */
export const isEmptyBroadcast = (value: unknown) =>
  value === "" || value === undefined || Number.isNaN(value);
