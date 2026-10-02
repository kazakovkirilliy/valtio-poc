/**
 * Broadcast commands: written on commit, then reset to `undefined` in the
 * same tick. Every product in every group copies the value into its own
 * field. Keys are named after their field ids (`stores/fields.ts`); each
 * product maps them to its own paths (see its store module).
 */
export type DealBroadcasts = {
  strike: string | undefined;
  callPut: string | undefined;
  buySell: string | undefined;
  ccyPair: string | undefined;
  deliveryDate: string | undefined;
  expiryCut: string | undefined;
  expiryDate: string | undefined;
  premiumDate: string | undefined;
  notionalAmount: number | undefined;
  settlementStyle: string | undefined;
  settlementCcy: string | undefined;
  settlementFixingSource: string | undefined;
};

export type DealBroadcastKey = keyof DealBroadcasts;

export const createBroadcasts = (): DealBroadcasts => ({
  strike: undefined,
  callPut: undefined,
  buySell: undefined,
  ccyPair: undefined,
  deliveryDate: undefined,
  expiryCut: undefined,
  expiryDate: undefined,
  premiumDate: undefined,
  notionalAmount: undefined,
  settlementStyle: undefined,
  settlementCcy: undefined,
  settlementFixingSource: undefined,
});

export const dealBroadcastKeys = Object.keys(
  createBroadcasts(),
) as DealBroadcastKey[];
