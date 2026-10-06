import type { DealReducer } from "./changes.ts";
import { onCcyPairChangeSetNotionalCcy } from "./onCcyPairChangeSetNotionalCcy.ts";

/**
 * The deal's business logic, in order (the original app's
 * `onStoreChanges`): every batch of writes, in every app, passes through
 * each reducer, and what they add is applied with it. Adding a reducer:
 * write it next to this file and list it here.
 */
export const onStoreChanges: readonly DealReducer[] = [onCcyPairChangeSetNotionalCcy];
