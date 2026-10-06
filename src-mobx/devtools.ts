/**
 * Development-only tooling, loaded by `main.tsx` in dev builds only, so none
 * of it reaches the production bundle.
 *
 * - Redux DevTools (browser extension, when installed): every action, with
 *   the app's state after it. Plain MobX has no snapshots to go back to, so
 *   there's no time travel here.
 * - `?debug` in the URL: the same actions, logged to the console.
 */
import { spy, toJS } from "mobx";
import { createActionLog } from "@shared/reduxDevtools.ts";
import { multiTabStore } from "./stores/multiTabStore.ts";
import { optionsStore } from "./stores/optionsStore.ts";

/**
 * The app as plain data: each deal's own state and its products' data, in
 * display order. Computeds (expiry days, validation), field models and the
 * spot stream are left out: they follow from it.
 */
const stateOf = () => ({
  activeDealId: multiTabStore.activeDealId,
  devtools: {
    isSpotPriceStreamEnabled: multiTabStore.devtools.isSpotPriceStreamEnabled,
    isAutocalcEnabled: multiTabStore.devtools.isAutocalcEnabled,
  },
  deals: Object.fromEntries(
    Object.entries(multiTabStore.deals).map(([dealId, deal]) => {
      const { notionalCcy, premiumCcy, notionalAmount, isInternal, hedgeType } = deal;
      const groups = deal.groupIds.map((groupId) => {
        const { groupType, ui, productList } = deal.groups[groupId];
        return {
          id: groupId,
          groupType,
          title: ui.title,
          products: productList.map((product) => ({ id: product.id, title: product.ui.title, data: toJS(product.data) })),
        };
      });
      return [dealId, { notionalCcy, premiumCcy, notionalAmount, isInternal, hedgeType, calc: toJS(deal.calc), groups }];
    }),
  ),
  options: { byKey: toJS(optionsStore.byKey), pending: optionsStore.pending },
});

const report = createActionLog({ name: "Deal editor (MobX)", getState: stateOf });

// spy sees every action, the nested ones and the reactions they set off
// included: report each outermost action once, when all of that is done
let depth = 0;
let outermost: { name: string; args: unknown[] } | undefined;
spy((event) => {
  if (event.type === "report-end") {
    depth -= 1;
    if (depth === 0 && outermost) {
      report(outermost.name, outermost.args);
      outermost = undefined;
    }
    return;
  }
  if (event.type === "action" && depth === 0) outermost = { name: event.name, args: [...event.arguments] };
  if ("spyReportStart" in event && event.spyReportStart) depth += 1;
});
