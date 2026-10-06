/**
 * A deal's calculation, independent of any state library: pure transitions
 * each app applies to its own store.
 *
 * Autocalc: the deal calculates whenever it is ready (no validation errors,
 * no request pending) and its price is missing or outdated. Any product edit
 * outdates the price and supersedes a calculation in flight: only the latest
 * request's response is applied.
 */

export type CalcState = {
  status: "none" | "calculating" | "done" | "outdated" | "error";
  /** The last price, kept while outdated or recalculating. */
  price: number | null;
  /** The request whose response is awaited; older responses are dropped. */
  requestId: number;
};

export const initialCalcState: CalcState = { status: "none", price: null, requestId: 0 };

/** Ready to calculate: nothing invalid, nothing still loading. */
export const isCalcReady = (hasValidationErrors: boolean, pendingRequests: number) =>
  !hasValidationErrors && pendingRequests === 0;

/** Whether autocalc has something to do. */
export const needsAutocalc = ({ status }: CalcState) =>
  status === "none" || status === "outdated";

export const calcStarted = (state: CalcState, requestId: number): CalcState => ({
  ...state,
  status: "calculating",
  requestId,
});

export const calcSucceeded = (state: CalcState, requestId: number, price: number): CalcState =>
  requestId === state.requestId ? { status: "done", price, requestId } : state;

export const calcFailed = (state: CalcState, requestId: number): CalcState =>
  requestId === state.requestId ? { ...state, status: "error" } : state;

/** The inputs changed: the price is outdated, a calculation in flight superseded. */
export const calcInputsChanged = (state: CalcState): CalcState => ({
  ...state,
  status: state.status === "none" ? "none" : "outdated",
  requestId: state.requestId + 1,
});
