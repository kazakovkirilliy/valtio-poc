# Deal editor: review and battletest of all 10 store implementations

Branch `jotai-zustand-upstream-sync` at `ebc603d` (2026-10-06). Seven reviewers ran in parallel: the shared core, a cross-app adversarial suite with a differential fuzzer, performance and memory, the MobX family, the proxy and atomic libraries, the event-driven libraries, and browser exploration. Around 2,000 scratch tests (vitest and Playwright) are in [`battletest/`](battletest); see [Re-running](#re-running-the-battletests). Nothing tracked was changed.

"Verified" means a test reproduces the finding. Severity: **bug** means something breaks for a user. **Divergence** means the apps behave differently, which skews the comparison. **Perf** and **leak** were measured. **Fairness** means a library is used in a way that over- or under-states its cost.

---

## 1. Summary

- **The core behaviour is solid and the same everywhere.** A differential fuzzer ran 70 seeds of 60–80 random operations against all 10 apps: edits, pastes, broadcasts, add/clone/remove, options failing or changing, prices resolving or rejecting. Values, presence, issues and readiness agreed at every step, and so did the settled price. Only the number of price requests differed.
- **The most visible bug is in every app.** Switching back to a tab adds a "Vanilla Group" each time (§2.1). It's a one-line design issue in the shared layout, and the existing e2e test can't see it.
- **Every app shares the input-handling bugs, because they live in `src-shared`:**
  - Typing `1,000` into a number cell clears it.
  - Expiry Days `1e9` throws.
  - Pasting a fixing-source label loses it.
  - Pasting the settings column gives the wrong hedge type.
  - Paths through `__proto__` pollute `Object.prototype` in 4 apps.
  - Tab never leaves the grid.
- **Several library-specific results matter for the choice:**
  - **Legend-State 3.0.0-beta.48:**
    - One throwing listener permanently stops every notification on the page. The cause is a library bug, confirmed in source.
    - Removed products are never freed: 386 KB per add/remove cycle.
  - **@effector/model 0.0.8:** it has a verified routing bug, applies one batch as N updates (so autocalc prices half-written deals), and costs about 355 KB per group.
  - **Time travel:** claimed by Valtio, MobX-State-Tree, mobx-keystone, Redux and Zustand, it is not faithful in any of them. Empty numbers (NaN) come back as `null`. A jump re-prices the deal or leaves it stuck "Calculating…". In Valtio, a jump destroys the app.
- **Speed at 133 products:**
  - Single edits are fast in every app (0.4–2.7 ms).
  - Whole-deal writes split the field:
    - 10–17 ms for Zustand, Redux, both Effector apps and Legend-State.
    - 60–200 ms for Valtio, MobX, MobX-State-Tree, mobx-keystone and Jotai.
  - Most of the slow apps' time is a linear product lookup in each app's `PathDeal` plus the shared grid read-back. That is fixable app code, not the library.
- **Cautions on the comparison:**
  - The shared grid notifier masks differences in re-render scope.
  - The options-arrival fix landed only in Zustand and Jotai, so they carry about 10 extra lines each for a guarantee the others lack.
  - Upstream's line counts include comments. For example, Effector Nested is 945 lines in total but 711 lines of code.

---

## 2. Bugs every app shares (shared code or the shared layout)

| # | Bug | Where | Evidence |
|---|---|---|---|
| 2.1 | **Switching back to a tab adds a Vanilla Group** each time: 4 switches give 5 groups, and a burst of 30 gives 14 per tab. Removing every group and switching tabs brings one back (G3). The phantom product re-prices the deal (1.00 → 2.00) or outdates a clean price. Edits otherwise survive. | `src-*/components/layout/MultiDeal.tsx` renders inactive tabs as `null`, so `Deal` unmounts. `Deal.tsx` calls `useOnMount(addNewGroup)`, and `src-shared/hooks/useOnMount.ts` guards per instance only. | 4 reviewers independently. `browser/tabs.spec.ts` (LEAD1, LEAD1c), `shared/sharedUi.spec.ts`, 10 screenshots in `browser/shots/`. The e2e test "tabs hold independent deals" never counts groups. |
| 2.2 | **Removing the last group while its cell is being edited throws** in SlickGrid (`Cannot read properties of undefined (reading 'id')`). The grid keeps showing the removed group. Legend-State's listener chain breaks, and later edits are lost. | `src-shared/grid/dealGrid.ts:311`, which calls `setColumns` with an editor open | `browser/staleremove.spec.ts`, `browser/editorlifecycle.spec.ts`, `shots/remove-last-while-editing-*.png` |
| 2.3 | **Typing `1,000` or `1,5` into a number cell clears it**, and Notional Amount is synced, so the whole deal clears with no error shown. Paste instead turns `1,5` into **15**. The editor also accepts `0x10` and `1e3`, and junk in Expiry Days wipes Expiry Date. | `grid/fieldEditor.ts:77-81` uses `Number()` directly; `grid/cellValues.ts:32` strips every comma | `shared/pure.test.ts`, `browser/editing.spec.ts`, `browser/clipboard.spec.ts`; confirmed in source |
| 2.4 | **Expiry Days `1e9` throws** `RangeError` out of `writePaths`. Batches are left torn in 6 apps; the others drop the batch or keep part of it. (`3e6` gives `"+010240-06"`.) | `lib/date.ts:28-30` | `shared/crossApp.test.ts` "P2: Expiry Days 1e9" |
| 2.5 | **Product paths through `__proto__` or `constructor.prototype` write into `Object.prototype`** in Valtio, MobX, mobx-keystone and Legend-State. The immutable apps instead create an own `"__proto__"` key. Not reachable from the grid today, which builds paths from field definitions. | `lib/path.ts:23-35` (`setValueByPath`), `:87-90`; `paths.ts:28-34` accepts any data path | 2 reviewers. `shared/pure.test.ts`, `cross-app/batches.test.ts` |
| 2.6 | **Writing an object over declared fields bypasses every field rule:** the synced fields drift apart (F2); a Delivery product gets a Fixing Source (O1); `productType` written by path breaks the product; `optionsCommon: null` crashes validation. A write under a leaf (`…strike.length`) throws mid-batch in Valtio, MobX and mobx-keystone, and silently turns the string into an object in the other 7. | `products/productWrites.ts:77-82` writes undeclared paths as they are | 2 reviewers. `cross-app/batches.test.ts`, `shared/crossApp.test.ts` |
| 2.7 | **Copying a Fixing Source loses it:** the clipboard carries the label, paste keeps the raw label where the field doesn't exist yet, and reconcile matches values only, so it falls back to the first option. | `options/optionsSource.ts:74-82`, `grid/cellValues.ts:39` | `browser/fixingpaste.spec.ts`, `shared/crossApp.test.ts` "E4/E5" |
| 2.8 | **Pasting the settings column back gives the wrong Hedge Type**, because Hedge Type is checked against the options before Internal flips. | `grid/paste.ts:48`, `dealSettings.ts:46-47` | `shared/crossApp.test.ts` "S2: pasting the settings…" |
| 2.9 | **Tab never leaves the grid:** 200 presses and focus stays on the last cell. The code comment says Tab leaves. | `grid/dealGrid.ts:217-218` stops propagation without moving focus | `browser/keyboardflow.spec.ts` |
| 2.10 | **A failed options load leaves the product permanently invalid** ("expected string, received undefined"). Calculate stays disabled and there's no retry, which goes against O8. Only flipping the style away and back recovers. | `products/vanillaProduct.ts:120` | `browser/failures.spec.ts`, `cross-app` |
| 2.11 | **The deal column's Expiry Days cell is editable, but the write is dropped**, while paste reports "Pasted 1 cell". | `grid/gridSource.ts:141-146`; `expiryDays` isn't in `broadcastFieldIds` | `browser/model.spec.ts`, `shared` |
| 2.12 | **The ccy-pair rule fires for a product the deal doesn't have**, setting Notional Ccy to EUR (P4 says such a path is ignored). | `dealWrites.ts:68`, `dealLogic/onCcyPairChangeSetNotionalCcy.ts` | `shared/crossApp.test.ts` "P4/P6" |
| 2.13 | **Expiry Days doesn't move at midnight:** it's computed at write time, so "Expiry date is in the past" never appears on its own. | `products/productWrites.ts:92-96` | `shared` "F4"; time zones and DST verified fine (9 zones) |
| 2.14 | **Layout:** at 375 px the frozen panes fill the screen and the products pane is 0 px wide. The tab bar never wraps (60 tabs make a 6,100 px page). | shared CSS and grid | `browser/resilience.spec.ts`, `browser/manytabs.spec.ts` |
| 2.15 | Smaller items: <ul><li>A copied column ending in an empty cell loses that row (`grid/clipboard.ts:39-41`).</li><li>Subscribing the same listener twice loses both on the first unsubscribe (`pathDeal.ts:61-71`).</li><li>One throwing `PathDeal` listener stops later listeners, such as the grid, from hearing that change (`pathDeal.ts:65`).</li><li>An empty deal is priced "done 0.00".</li><li>One deal's pending options load blocks Calculate in every tab, because `pending` is global.</li><li>Inactive tabs' spot streams keep ticking.</li></ul> | various | `shared`, `cross-app`, `browser` |

---

## 3. Library-specific findings

### Legend-State (`src-legend-state`, 3.0.0-beta.48)

- **bug (library)**: when a listener throws during a batch, every Legend-State notification on the page stops for good: autocalc, the grid, and even new deals.
  - Cause: `node_modules/@legendapp/state/index.mjs:786-788` sets `isRunningBatch = true; runBatch(); isRunningBatch = false` with no `try/finally`. Confirmed in source.
  - Evidence: `cross-app/throwingListener.test.ts`. Removing a group while its cell is being edited (§2.2) triggers it from the UI.
- **leak**: every removed product is kept, about 386 KB per add/remove cycle (188 MB after 500 cycles), and `dispose()` doesn't free it. Each live product also costs about 100 KB.
  - Cause: 16 per-field `computed`s per product register listeners on leaf nodes (`stores/dealStore.ts:131-158`). Legend never prunes deleted object keys, and `validations.delete` (`:308`) only drops a Map entry.
  - Evidence: 2 reviewers; `perf/leak.test.ts`, `proxy-atomic/legend.test.ts`, heap retainer path.
- **divergence**: each keystroke causes 2 notifications (the edit, then "price outdated"), and computeds are stale inside a batch (hence the `queueMicrotask` autocalc).
- **divergence**: the extra calculation when options arrive is still present (load counted done before reconcile, `dealStore.ts:203-217`).
- **robustness**: stored switches of `[]` or `null` turn both switches off.

### Effector Model (`src-effector-model`, @effector/model 0.0.8)

- **bug**: one batch spanning N groups is N store updates, so autocalc prices half-written deals.
  - A 75-group paste sent 76 price requests. Syncing 1000 across 5 groups priced `[6,7,8,9,10]`.
  - Cause: `stores/dealStore.ts:240` writes one group at a time, and `:278` recalculates on `$groupsById`.
  - No fix is possible inside 0.0.8.
  - Evidence: 2 reviewers.
- **bug (library)**: in `index.esm.js:435-444`, the api-routing loop `for (const key in instance.api)` shadows the item key. An item whose key equals an api name is called twice, and routing costs O(n) on every api call. The library's own comments mark it as a hack ("wont make it way to release").
- **perf/memory**: about 355 KB fixed per group, so a 100-group deal takes 44 MB (plain-data apps take 0.4–3 MB). It creates 5× the graph units of Effector Nested.
- **divergence**: it reconciles options across every deal (also Redux and Effector Nested, see §4). The switches sync across browser tabs through `effector-storage`'s default `sync: true`, against D3 and the README.
- **dead code**: `pathStore`/`readPath` (25 lines) is used only by a test, its cache leaks, and the lens comment ("other groups' writes never reach it") is false. `$validation` is exported but unused.
- **devtools**: log-only (no time travel). A 20-cell paste makes 308 log entries, and the adapter keeps only the last 99 per 500 ms.

### Valtio (`src-valtio`)

- **bug**: writing an object at a container path (allowed by P4) replaces the nested proxy, and every per-field `subscribeKey` stays bound to the old one. Validation and repaint for those fields stop for good, so autocalc can price invalid data. With MobX, Expiry Days also stops following.
  - Where: `stores/subscribe.ts:9-17`, `validation.ts:40-42`, `pathDeal.ts:46-51`.
  - Evidence: 2 reviewers.
- **bug (dev)**: a Redux DevTools jump does `Object.assign(multiTabStore, JSON)`, which wipes every `actions` object and `spotPriceStream`, so the next click throws. It also sends the whole tree on every change (6.6 KB per keystroke with 5 deals). See `stores/multiTabStore.ts:61-65`.
- **perf**: `valtio-reactive` slows every property read on every proxy about 2× (the broadcast profile shows 35–42% in it). It is used for only two `effect()`s, and it only tracks proxies created after it loads. `"valtio": "latest"` makes that fragile.
- **perf**: removing groups is quadratic (`validation.ts:47-52`, `pathDeal.ts:55-60`): removing 400 groups takes 1.3 s.
- **divergence**:
  - `valtio-auto-persist` saves 100 ms after a change, and its storage key comes from the state's shape, so adding a field resets the switches.
  - Unparsable stored JSON gives a blank page.
  - There's no `?debug` logging and no `dispose`.
  - It still has the extra calculation when options arrive.
- **nit**: `??=` at `multiTabStore.ts:23` breaks the CLAUDE.md rule against logical assignment. `options.hedgeTypes` is dead state.

### MobX (`src-mobx`)

- **perf**: change detection uses `JSON.stringify` over every product on every change (`dealStore.ts:214`, `pathDeal.ts:30`). That is 41% of edit time, and adding 150 groups takes 454 ms, against about 30–50 ms for MobX-State-Tree, mobx-keystone and Valtio.
- **bug (edge)**: the same stringify can't see NaN ↔ ±Infinity or 0 ↔ −0. Pasting `1e999` leaves a stale "done" price on a now-invalid deal (C3).
- **divergence**:
  - Autocalc can run before the inputs-changed reaction, so a write that makes the deal ready is priced twice.
  - It still has the extra calculation when options arrive.
- **devtools**: entries get generated names (`ObservableObject@5.writePaths`, `<unnamed action>`); no time travel, as documented.
- **No writes outside actions** in any flow; verified with `enforceActions: "always"`.

### MobX-State-Tree (`src-mobx-state-tree`)

- **bug (dev)**: time travel throws when a deal-level number is empty (NaN → `null` → `applySnapshot` type error) and leaves the tree half-applied, with the synced fields out of step. Even a successful jump turns empty product numbers into validation errors and re-prices the deal. The switches aren't connected to DevTools.
- **perf**:
  - A product's issues are recomputed in full on every grid read while the deal is invalid, which a new deal always is: 225 validations per edit against 1.
  - Product lookup is a linear scan; `resolveIdentifier` is about 50× faster.
  - Broadcast plus repaint at 300 products takes about 1 s.
- **bug**: a `null` synced value throws and aborts the batch, and a price arriving after `destroy` writes to a dead node (missing `isAlive` check, `dealModel.ts:152`). Corrupt stored switches crash it at import.

### mobx-keystone (`src-mobx-keystone`)

- **bug (dev)**: the same time-travel problems as MobX-State-Tree (empty numbers come back `null` and fail validation; a jump re-prices). Child-action logging mislabels actions across the two DevTools instances.
- **bug**: a `null`/`undefined` synced value silently falls back to the prop default, so the deal shows `"2"` while the products hold `null` (F2).
- **perf**: the same uncached validation and linear lookup as MobX-State-Tree.
- **footgun**: a deal outside a registered root store never autocalcs, with no warning.

### Redux Toolkit (`src-redux`)

- **divergence**: options arriving for one deal reconcile **every** deal, which also happens in both Effector apps. Opening a new tab can silently change another deal's fixing source and re-price it. HANDOFF says this is "equivalent" and Redux-only; it is neither (§4).
- **bug (dev)**: time travel isn't sound:
  - Reducers read the clock through the derived Expiry Days, so replaying on another day gives a different state.
  - `pathsWritten` carries routed snapshots, so skipping an action breaks the sync.
  - The in-flight `pending` count lives in state, so committing mid-load leaves the deal never ready.
  - Spot streams live in `extraArgument`, so a restored deal has no stream.
- **bug**: a store subscriber that throws aborts the dispatch, so autocalc doesn't run until the next action (`store.ts:45`).
- **Good**: fastest in a production build (0.22 ms per edit at 300 products); the WeakMap issues cache is exact; no autocalc loop.

### Zustand (`src-zustand`)

- **bug**: a listener that throws during autocalc leaves `calc` "calculating" forever with no request in flight, because `set(calcStarted)` notifies before `calculatePrice` is called (`dealStore.ts:208-213`).
- **divergence (dev)**: time travel keeps the actions (the replacer works), but:
  - NaN comes back as `null`, so data that was valid when recorded fails validation;
  - a jump to "calculating" stays stuck;
  - a jump to "outdated" triggers a real request.

  Hydration bypasses DevTools, so its init shows the defaults.
- **latent**: no `dispose`, so a deal can't be released (it only matters once tabs can close).
- **Good**: fastest or tied in every Node workload; the smallest memory (2.8 KB per product); flat leak slope; one notification per batch; a clone re-validates nothing.

### Jotai (`src-jotai`)

- **robustness**:
  - A stored `null` gives a blank page.
  - A stored object missing a key turns **both** switches off, because defaults aren't merged.
- **perf**:
  - Whole-deal writes are about 5× Zustand's (broadcast 74 ms at 133 products), from the linear `findProduct` calling `store.get(groupsAtom)` in the loop (`pathDeal.ts:20-22`).
  - Add and remove are O(n), because `hasValidationErrorsAtom` reads every `dataAtom` when it only needs the `issuesAtom`s.
  - A clone re-validates, where Zustand's WeakMap gives 0.
- **devtools**: the `store.set` monkey-patch misses unlabelled top-level sets (e.g. a future `useSetAtom`). Async continuations show up as "(outside an action)". No time travel.
- **Good**: correct batching; atoms in atoms are garbage-collected (removed groups freed, `dispose` works); the narrowest notifications; the switches no longer sync across tabs.

### Effector Nested (`src-effector-nested`)

- **divergence**:
  - Reconciles options across every deal (§4).
  - Every edit is emitted twice to `PathDeal` subscribers (the `$groups` and `$validation` watchers), and a no-op settings write still emits.
- **leak (latent)**: `dispose()` only stops the stream. The deal stays linked to the module-level effects and keeps reconciling.
- **scopes**:
  - Every deal shares one sid, because units are created inside `addNewDealEffect`. After serialize and hydrate, deal A held deal B's groups.
  - The initial options load runs outside the scope.

  It doesn't matter for this client-only app, but it does for tests that would use scopes.
- **nit**: `||=` at `stores/groupStore.ts:36` breaks the CLAUDE.md rule against logical assignment.
- **Good**: fast (tied with Zustand), small memory, one update per batch, verified copy-on-write.

---

## 4. Divergences that skew the comparison

| What | Apps that differ | Note |
|---|---|---|
| **Extra, superseded calculation when options arrive** (the load counts as done before products reconcile) | Valtio, MobX, MobX-State-Tree, mobx-keystone, Legend-State still have it. Zustand and Jotai were fixed in `ebc603d`. Redux and both Effector apps avoid it by design. | Unfair to Zustand and Jotai (about 10 lines each). Fix the others, or note it. |
| **Options reconcile every deal or only the deal that asked** | Redux, Effector Nested and Effector Model reconcile every deal; the other 7 only the requesting deal. | With a changing server list, the 7 leave another tab on a value the server no longer offers (shown as a raw id); the 3 rewrite and re-price it. Pick one rule. |
| **Switches synced across browser tabs** | Effector Nested (by spec, D3) and Effector Model (not by spec) | Effector Model needs `sync: false`. |
| **Writing a field and writing it back in one batch** | 9 of 10 outdate a "done" price; only MobX sees no change. | The shared `planProductWrites`/`withDealField` report a change even when the result equals the original. |
| **`dispose`** | Valtio and Zustand have none; Effector's only stops the stream; MobX-State-Tree throws on later writes. | Latent until tabs can close. |
| **Listener errors** | Legend-State (all notifications stop), Zustand (stuck "calculating"), Redux (autocalc skipped). The rest recover. | The shared `createChangeHub` doesn't isolate listeners either. |
| **Time travel** | Real but unfaithful in Redux and Zustand. Broken in Valtio, MobX-State-Tree and mobx-keystone. Log-only in MobX, Legend-State, Jotai and both Effector apps. | The README and devtools comments overstate it in several apps. |
| **Repaint scope (E7)** | All apps pass, because the **shared** notifier re-reads and de-duplicates cells. | The e2e repaint tests can't tell libraries apart; use `libraries.test.ts`-style tests. |
| **Per-cell read cost** | Five apps scan the deal per lookup (Valtio, MobX, MobX-State-Tree, mobx-keystone, Jotai). Effector Model has an index. | This is app code, not the library; an index fixes it everywhere. |
| **Paste floor** | Every app | The shared router fans synced writes out O(products²): a 13-field paste over 133 products becomes 54,530 planned writes, taking 60 ms in shared code alone. |

---

## 5. Performance and memory (Node, 100 groups = 133 products, median of 3)

| App | Edit 1 field | Broadcast to all | Paste 13 × 133 | Read every cell | Build 100 groups | KB per product | Leak per cycle (Node, grid on) |
|---|--:|--:|--:|--:|--:|--:|--:|
| Zustand | **0.4** | 12.8 | 87 | 5.1 | **42** | **2.8** | 11.0 |
| Effector Nested | 0.5 | **10.5** | 81 | **1.9** | 46 | 3.8 | 12.5 |
| Redux | 0.8 | 16.0 | 107 | 5.8 | 60 | **2.8** | 11.0 |
| Effector Model | 0.9 | 17.1 | **78** | 3.3 | 92 | 63.6 (+355 per group) | 11.1 |
| Legend-State | 0.8 | 17.2 | 129 | 3.4 | 119 | 103.5 | **396** |
| Valtio | 0.9 | 61.6 | 172 | 29.7 | 100 | 47.6 | 9.5 |
| Jotai | 1.2 | 74.4 | 176 | 35.0 | 186 | 5.3 | 10.8 |
| MobX | 2.7 | 92.1 | 208 | 43.0 | 331 | 40.7 | 12.3 |
| mobx-keystone | 2.0 | 145 | 250 | 87.7 | 274 | 20.7 | 10.2 |
| MobX-State-Tree | 2.5 | 197 | 311 | 119 | 390 | 10.2 | 12.5 |

Times are in ms and include the grid's read-back. The browser numbers rank the same way. The edit-to-paint time is 0.9–1.7 ms in every app; a synced edit repainting other cells takes 5.7 ms in Zustand and 53 ms in MobX-State-Tree. Every edit is **one React commit** in every app; only `DealHeader` re-renders, once per keystroke, because `calcInputsChanged` always returns a new `calc`. About 27–33 KB per add/remove cycle leaks in **every** app in the browser: the shared notifier's `shown`/`knownColumns` maps are never pruned, and SlickGrid keeps the old header DOM after each `setColumns`. Full tables: `battletest/perf/results/report-scale-median.md` and `report-browser-median.md`.

Caveat: the machine was shared by seven reviewers. The spread is under 5% for most cells, and medians are used throughout.

---

## 6. Verdict per library

Lines are code lines from upstream's counts (comments excluded where the reviewers measured them).

| Library | Reviewers' verdict |
|---|---|
| **Zustand** | **Strongest on the numbers:** fastest, smallest memory, no leaks, one notification per batch, exact validation cache. Its weak spots are listener re-entrancy (needs care), time travel that isn't faithful for NaN or in-flight states, and no `dispose`. Mirroring Valtio costs it about 30 lines; `subscribeWithSelector` and a logger middleware would cut about 30. |
| **Redux Toolkit** | Idiomatic and not handicapped. Viewing past states really works, and an edit and its load land in one dispatch. It's fastest in production. Its time travel is unsound as designed (fix: intent-only actions, the clock passed into actions, in-flight counts outside the store). It has the most ceremony (19 files). It could be about 640–660 lines with `createSlice`, prepare callbacks and RTK Query. |
| **Effector Nested** | Fast, small, one update per batch, cross-tab persistence in about 12 lines. DevTools are log-only, `dispose` is incomplete, sids are shared, and it reconciles across deals. Its 945 lines are 711 of code. |
| **Jotai** | Correct batching, garbage-collected atoms in atoms, a working `dispose`, the narrowest notifications. It's slower on whole-deal writes (an index fixes most of it), uses a DevTools monkey-patch (store hooks or jotai-devtools would cut about 50 lines), and defines each action three times (atom, label, wrapper). |
| **Valtio** | Writes are plain assignments. But the subscription plumbing is fragile (container writes), `valtio-reactive` halves read speed, time travel breaks the app, and the persist plugin has quirks. It's the **least idiomatic baseline**: ops-based `subscribe` plus snapshot-cached validation would cut about 90–120 lines and fix several findings. |
| **MobX** | Validation is cached per field (one field re-validated per edit), and its components are about 45 lines shorter thanks to `observer`. `JSON.stringify` change detection is its main cost. About 120–150 lines are incidental (copying Valtio's shape, an unused field model). |
| **MobX-State-Tree** | **The smallest app (649 lines):** snapshots, frozen data, computed titles, `addDisposer`. But its time travel is broken, validation is uncached while the deal is invalid, and lookups are slow (`resolveIdentifier` fixes those). Its runtime types reject wrongly typed path writes that every other app stores. |
| **mobx-keystone** | Classes read well, data stays plain objects patched leaf by leaf, and its own DevTools adapter offers time travel. But it needs the decorators babel plugin, has MobX-State-Tree's time-travel and validation problems, and a root-store footgun. |
| **Legend-State** | The most compact change detection (one `onChange` with paths) and 3-line persistence. But it's a beta with a **page-killing batch bug** and a **large leak**. Not recommended until a fixed stable v3. |
| **Effector Model** | A 0.0.x library with a verified routing bug, N updates per batch and about 355 KB per group. Not recommended until `@effector/model` matures. |

---

## 7. Improvements worth making (by payoff)

1. **Create the first group when the deal is created**, not in `Deal`'s mount effect (§2.1). That is about −3 lines per app. Add a group-count check to the e2e tab test.
2. **Shared input fixes** in `src-shared`:
   - one number parser for both the editor and paste (§2.3), rejecting text that doesn't parse;
   - bound `dateInDays` (§2.4);
   - reject `__proto__`/`constructor`/`prototype` path segments, and refuse writes past a leaf or to `productType`, expanding object writes into leaf writes (§2.5–2.6);
   - a label-aware `reconcileOption` (§2.7);
   - write Internal before Hedge Type (§2.8);
   - focus out of the grid on Tab past the last cell (§2.9);
   - cancel any open editor before `setColumns` (§2.2);
   - add `expiryDays` to the broadcast fields (§2.11);
   - isolate listeners in `createChangeHub` (§2.15).
3. **Make the comparison fair:** apply the options-arrival ordering to Valtio, MobX, MobX-State-Tree, mobx-keystone and Legend-State (about +4 lines each); pick one rule for cross-deal reconciling; set `sync: false` in Effector Model; fix the README and HANDOFF claims about time travel and about "Redux-only" cross-deal reconciling.
4. **A product index in each `PathDeal`** (productId → groupId), and resolve the product once per `getCell` (`pathGridSource.ts:51-68`). That removes most of the 60–200 ms whole-deal cost in 5 apps.
5. **Shared router:** last-write-wins coalescing and skipping the fan-out when the deal value is unchanged (54,530 → 19,418 planned writes in the prototype); pre-split path segments in `setIn`.
6. **Leaks:** prune the notifier maps when columns go away, and unbind or recreate SlickGrid headers. Replace Legend-State's per-field computeds with a WeakMap over immutable data, or one computed per product.
7. **Shared helpers to cut per-app glue:** `shouldAutocalc`, `reconcileDeal`, a clone helper, and `changed` flags from `routeWrites`. Line counts currently mostly measure this glue.

Most of these touch upstream code (`src-shared` and the upstream apps). Fixing them only in this fork would make it drift from upstream, so items 1–3 are better sent upstream as issues or a PR.

---

## Re-running the battletests

The tests were moved out of `tests/` because some intentionally fail while a bug exists, and they broke `pnpm test` and `tsc -b`. To run them, copy them back:

```bash
cp -R review/battletest tests/battletest
```

```bash
rtk proxy npx vitest run tests/battletest/cross-app
```

```bash
npx playwright test -c tests/battletest/browser/playwright.config.ts
```

Remove the copy (`rm -r tests/battletest`) before running the normal suites.

| Folder | Contents |
|---|---|
| `shared/` | Pure tests of the shared rules, cross-app spec checks, UI checks for the shared bugs (`SHOW_BUGS=1` shows the real failures) |
| `cross-app/` | 8 suites × 10 apps plus a seeded differential fuzzer (`FUZZ_SEEDS`, `FUZZ_OPS`); `STRICT=1` un-pins the known failures; per-app results in `results/*.json` |
| `perf/` | Scale, leak, memory, lookup and router benchmarks, CPU profiles, browser timings; results in `results/` |
| `mobx-family/`, `proxy-atomic/`, `event-driven/` | Library-specific claims, DevTools and time travel with a fake extension, `dispose` and leaks |
| `browser/` | 601 Playwright tests; `obs/` has per-app observations (`node compare.mjs` shows SAME/DIFF); `shots/` has screenshots |
