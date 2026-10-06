import { type Draft, createReducer, isAnyOf } from "@reduxjs/toolkit";
import { type OptionsState, optionsFailed, optionsLoaded, optionsLoading } from "@shared/options/optionsSource.ts";
import { dealAdded, groupInserted, keyOf, optionsReceived, optionsRequestFailed, pathsWritten } from "./actions.ts";

export type OptionsStoreState = {
  /** Loaded options per source and parameter (see `optionsKey`). */
  byKey: Record<string, OptionsState>;
  /** Loads in flight. */
  pending: number;
};

/** Stores a key's new state (the shared helpers' readonly lists, as the draft types them). */
const setEntry = (state: Draft<OptionsStoreState>, key: string, next: OptionsState) => {
  state.byKey[key] = next as Draft<OptionsState>;
};

/** Every async dropdown's options, shared by every deal. */
export const optionsReducer = createReducer<OptionsStoreState>({ byKey: {}, pending: 0 }, (builder) =>
  builder
    .addCase(optionsReceived, (state, { payload }) => {
      const key = keyOf(payload);
      // unchanged options come back as the same object: no change
      setEntry(state, key, optionsLoaded(state.byKey[key], payload.options));
      state.pending -= 1;
    })
    .addCase(optionsRequestFailed, (state, { payload }) => {
      const key = keyOf(payload);
      setEntry(state, key, optionsFailed(state.byKey[key]));
      state.pending -= 1;
    })
    // whatever starts loading options counts them pending in the same dispatch
    .addMatcher(isAnyOf(dealAdded, groupInserted, pathsWritten), (state, { payload: { requests } }) => {
      for (const request of requests) {
        const key = keyOf(request);
        setEntry(state, key, optionsLoading(state.byKey[key]));
        state.pending += 1;
      }
    }),
);
