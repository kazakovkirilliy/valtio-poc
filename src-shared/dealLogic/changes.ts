import type { DealFieldsState } from "../dealFields.ts";
import type { DealSettingsState } from "../dealSettings.ts";
import { setIn } from "../lib/path.ts";
import type { PathWrite } from "../paths.ts";
import type { ProductData } from "../products/productRegistry.ts";

/**
 * The deal's business logic as the original app writes it: a list of
 * reducers (`onStoreChanges`), piped. Each gets the deal's state before
 * the batch and every change so far (the user's, then what earlier
 * reducers added), and returns the changes it adds. The whole result is
 * applied as one batch, by the same rules as the user's own writes.
 */

/** The deal store's state, as reducers read it: the deal's own fields at the root, each product's data at its path. */
export type DealState = DealFieldsState &
  DealSettingsState & {
    groups: Record<string, { products: Record<string, { data: ProductData }> }>;
  };

export type ChangeMeta = { isUserChange: boolean };

/** A change at a dot path (`ChangesAsDotPaths`). */
export type Change = readonly [path: string, value: unknown, meta: ChangeMeta];

/** A change a reducer adds; without a meta, it isn't the user's. */
export type ReducerChange = readonly [path: string, value: unknown, meta?: ChangeMeta];

/** Returns the changes it adds: an array of them, a single one, or nothing. */
export type DealReducer = (
  prevState: DealState,
  changes: readonly Change[],
) => readonly ReducerChange[] | ReducerChange | undefined | void;

/** The state with the changes applied, in order (copies only what changed). */
export const applyChangesToState = <State extends object>(
  state: State,
  changes: readonly ReducerChange[],
): State => changes.reduce((next, [path, value]) => setIn(next, path, value), state);

const isSingleChange = (result: readonly ReducerChange[] | ReducerChange): result is ReducerChange =>
  typeof result[0] === "string";

/** The user's writes, then every change the reducers add, in order. */
export const runDealLogic = (
  prevState: DealState,
  writes: readonly PathWrite[],
  reducers: readonly DealReducer[],
): PathWrite[] => {
  let changes: Change[] = writes.map(({ path, value }) => [path, value, { isUserChange: true }]);
  for (const reducer of reducers) {
    const result = reducer(prevState, changes);
    if (!result) continue;
    const added = isSingleChange(result) ? [result] : result;
    changes = [...changes, ...added.map(([path, value, meta]): Change => [path, value, meta ?? { isUserChange: false }])];
  }
  return changes.map(([path, value]) => ({ path, value }));
};

/** The deal's state from the parts every store hands the router: its fields, its settings, and its products in order. */
export const dealStateOf = (state: {
  dealFields: DealFieldsState;
  settings: DealSettingsState;
  products: readonly { groupId: string; productId: string; data: ProductData }[];
}): DealState => {
  const groups: DealState["groups"] = {};
  for (const { groupId, productId, data } of state.products) {
    if (!groups[groupId]) groups[groupId] = { products: {} };
    groups[groupId].products[productId] = { data };
  }
  return { ...state.dealFields, ...state.settings, groups };
};
