/**
 * Development-only tooling, loaded by `main.tsx` in dev builds only, so none
 * of it reaches the production bundle.
 *
 * - Redux DevTools (browser extension, when installed): built into the store
 *   (`configureStore`), with time travel: the state is all there is.
 * - `?debug` in the URL: every action, logged to the console.
 */
import { isDebugEnabled } from "@shared/reduxDevtools.ts";
import { app } from "./stores/app.ts";

if (isDebugEnabled) {
  app.listener.startListening({
    predicate: () => true,
    effect: (action) => console.log("[Deal editor (Redux)]", action.type, "payload" in action ? action.payload : ""),
  });
}
