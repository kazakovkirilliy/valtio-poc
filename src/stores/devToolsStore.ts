import { persist } from "valtio-persist";

export type DevToolsStore = {
  isSpotPriceStreamEnabled: boolean;
};

export const { store: devtoolsStore } = await persist<DevToolsStore>(
  {
    isSpotPriceStreamEnabled: true,
  },
  // Storage key
  "multiTabStore",
);
