import { type PayloadAction, createSlice } from "@reduxjs/toolkit";
import { dealAdded } from "./actions.ts";

export type TabsState = {
  activeDealId: string;
  dealIds: string[]; // tab order
};

const tabsSlice = createSlice({
  name: "tabs",
  initialState: { activeDealId: "", dealIds: [] } as TabsState,
  reducers: {
    activeDealSet(state, { payload }: PayloadAction<string>) {
      state.activeDealId = payload;
    },
  },
  extraReducers: (builder) =>
    builder.addCase(dealAdded, (state, { payload: { dealId } }) => {
      state.dealIds.push(dealId);
      state.activeDealId = dealId;
    }),
});

export const { activeDealSet } = tabsSlice.actions;
export const tabsReducer = tabsSlice.reducer;
