/**
 * Development-only tooling, loaded by `main.tsx` in dev builds only, so none
 * of it reaches the production bundle. Unit names and code locations come
 * from `effector/babel-plugin` (see vite.config.ts).
 *
 * - Redux DevTools (browser extension, when installed): every event and
 *   store update.
 * - `?debug` in the URL: patronum's `debug` logs each deal's actions and
 *   state, and the shared options, to the console, with the chain of
 *   updates that led to each one.
 */
import { attachReduxDevTools } from "@effector/redux-devtools-adapter";
import type { Unit } from "effector";
import { debug } from "patronum";
import { $optionsByKey, loadOptionsFx } from "./stores/optionsStore.ts";
import { $dealIds, getDealStore } from "./stores/multiTabStore.ts";

// the adapter logs an error when the extension is missing: attach only if it's
// installed, and say so otherwise (e.g. its site access doesn't cover this page)
if ("__REDUX_DEVTOOLS_EXTENSION__" in window) {
  // stateTab: every store's value in the State/Diff tabs (off by default)
  attachReduxDevTools({ name: "Deal editor (Effector)", trace: true, stateTab: true });
} else {
  console.info(
    "[devtools] Redux DevTools extension not found on this page: install it, or allow it on this site, then reload.",
  );
}

if (new URLSearchParams(location.search).has("debug")) {
  debug({ trace: true }, { $optionsByKey, loadOptionsFx });

  // every deal's units are named after their variables, the same in every
  // deal: prefix them with the deal's tab
  const debugged = new Set<string>();
  $dealIds.watch((dealIds) =>
    dealIds.forEach((dealId, index) => {
      if (debugged.has(dealId)) return;
      debugged.add(dealId);
      const { actions, $dealFields, $groups, $products } = getDealStore(dealId);
      const units: Record<string, Unit<unknown>> = { ...actions, $dealFields, $groups, $products };
      debug(
        { trace: true },
        Object.fromEntries(Object.entries(units).map(([name, unit]) => [`Tab ${index + 1} ${name}`, unit])),
      );
    }),
  );
}
