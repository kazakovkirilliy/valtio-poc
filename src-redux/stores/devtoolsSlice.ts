import { createSlice } from "@reduxjs/toolkit";

/** App-wide developer settings (persisted by `app.ts`). */
export type DevtoolsState = {
  isSpotPriceStreamEnabled: boolean;
  isAutocalcEnabled: boolean;
};

export const defaultDevtools: DevtoolsState = { isSpotPriceStreamEnabled: true, isAutocalcEnabled: true };

const devtoolsSlice = createSlice({
  name: "devtools",
  initialState: defaultDevtools,
  reducers: {
    spotPriceStreamToggled(state) {
      state.isSpotPriceStreamEnabled = !state.isSpotPriceStreamEnabled;
    },
    autocalcToggled(state) {
      state.isAutocalcEnabled = !state.isAutocalcEnabled;
    },
  },
});

export const { spotPriceStreamToggled, autocalcToggled } = devtoolsSlice.actions;
export const devtoolsReducer = devtoolsSlice.reducer;
