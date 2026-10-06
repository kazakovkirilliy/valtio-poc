import { type DevtoolsState, defaultDevtools } from "./devtoolsSlice.ts";
import { createApp } from "./store.ts";

const DEVTOOLS_STORAGE_KEY = "redux-devtools-settings";

const loadDevtools = (): DevtoolsState => {
  try {
    return { ...defaultDevtools, ...JSON.parse(localStorage.getItem(DEVTOOLS_STORAGE_KEY) ?? "{}") };
  } catch {
    return defaultDevtools;
  }
};

/** The app's store, its developer settings loaded from localStorage. */
export const app = createApp(loadDevtools());

// saved whenever they change: a new object means a new value
let savedDevtools = app.store.getState().devtools;
app.store.subscribe(() => {
  const { devtools } = app.store.getState();
  if (devtools === savedDevtools) return;
  savedDevtools = devtools;
  try {
    localStorage.setItem(DEVTOOLS_STORAGE_KEY, JSON.stringify(devtools));
  } catch {
    // storage unavailable (private mode): keep the in-memory value
  }
});
