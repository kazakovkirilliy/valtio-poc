import { type DealReducer, applyChangesToState } from "./changes.ts";

const isCcyPairPath = (path: string) => path === "ccyPair" || path.endsWith(".base.ccyPair");

/**
 * When the user picks a currency pair, on the deal or on any product, the
 * notional currency becomes the pair's base currency (EURUSD → EUR); it
 * is synced, so the whole deal follows. An example of a reducer written
 * the original app's way.
 */
export const onCcyPairChangeSetNotionalCcy: DealReducer = (prevState, changes) => {
  const pairChange = changes.findLast(([path, , meta]) => meta.isUserChange && isCcyPairPath(path));
  if (!pairChange || !/^[A-Z]{6}$/.test(String(pairChange[1]))) return;

  const baseCcy = String(pairChange[1]).slice(0, 3);
  const currentState = applyChangesToState(prevState, changes);
  if (currentState.notionalCcy !== baseCcy) return [["notionalCcy", baseCcy]];
};
