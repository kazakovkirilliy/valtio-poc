# Deal editor: one app, ten state libraries

This fork tracks upstream [`mohamad-qb/valtio-poc`](https://github.com/mohamad-qb/valtio-poc) (merged through `75ecd55`) and adds **Zustand** and **Jotai** versions, built the same way as upstream's apps: same file layout, same names, same shared rules. The point is to compare how much code each library needs for the same features.

- How the apps fit together, and how to add one: [CLAUDE.md](CLAUDE.md)
- What every version must do, each requirement linked to its test: [REQUIREMENTS.md](REQUIREMENTS.md)
- Upstream's notes on the Legend-State and Redux versions: [HANDOFF.md](HANDOFF.md)

| App | Folder | Page |
| --- | --- | --- |
| Valtio | [src-valtio](src-valtio) | `/valtio.html` |
| MobX | [src-mobx](src-mobx) | `/mobx.html` |
| MobX-State-Tree | [src-mobx-state-tree](src-mobx-state-tree) | `/mobx-state-tree.html` |
| mobx-keystone | [src-mobx-keystone](src-mobx-keystone) | `/mobx-keystone.html` |
| Legend-State | [src-legend-state](src-legend-state) | `/legend-state.html` |
| Redux Toolkit | [src-redux](src-redux) | `/redux.html` |
| **Zustand** | [src-zustand](src-zustand) | `/zustand.html` |
| **Jotai** | [src-jotai](src-jotai) | `/jotai.html` |
| Effector Nested | [src-effector-nested](src-effector-nested) | `/effector-nested.html` |
| Effector Model | [src-effector-model](src-effector-model) | `/effector-model.html` |

## Run

```sh
pnpm install
pnpm dev          # landing page links to every app
npx tsc -b        # types
pnpm test         # store tests: every scenario against every app
pnpm test:e2e     # browser tests (installed Chrome), narrow with -g "<app>"
```

## Boilerplate per app

Lines per app folder, comments included. Everything library-independent (routing, validation, product rules, the grid) lives in `src-shared/` and isn't counted.

| App | stores | components | devtools.ts | other | total | files |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Valtio | 631 | 206 | — | 64 | 901 | 15 |
| MobX | 661 | 159 | 61 | 26 | 907 | 14 |
| MobX-State-Tree | 441 | 158 | 26 | 24 | 649 | 13 |
| mobx-keystone | 454 | 159 | 31 | 24 | 668 | 13 |
| Legend-State | 565 | 173 | 33 | 22 | 793 | 11 |
| Redux Toolkit | 662 | 172 | 17 | 32 | 883 | 19 |
| **Zustand** | 635 | 202 | 41 | 21 | 899 | 14 |
| **Jotai** | 566 | 195 | 68 | 21 | 850 | 13 |
| Effector Nested | 623 | 187 | 77 | 58 | 945 | 14 |
| Effector Model | 614 | 187 | 64 | 58 | 923 | 13 |

Zustand and Jotai mirror Valtio file for file, so they can be diffed directly. `App.tsx`, `Deal.tsx` and `DealStoreProvider.tsx` are the same in all three apps apart from one comment. `MultiDeal.tsx` and `DealHeader.tsx` differ only in how they read state.

| File | Valtio | Zustand | Jotai |
| --- | ---: | ---: | ---: |
| `stores/dealStore.ts` | 224 | 264 | 255 |
| `stores/groupStore.ts` | 58 | 46 | 47 |
| `stores/productStore.ts` | 45 | 29 | 41 |
| `stores/validation.ts` | 52 | 42 | — (a derived atom per product) |
| `stores/multiTabStore.ts` | 65 | 83 | 70 |
| `stores/optionsStore.ts` | 46 | 72 | 55 |
| `stores/pathDeal.ts` | 124 | 99 | 98 |
| `stores/subscribe.ts` + `hooks/useProxyValue.ts` | 63 | — (`useStore`) | — (`useAtomValue`) |
| `devtools.ts` | — (in `multiTabStore.ts`) | 41 | 68 |

## Zustand (`src-zustand/`)

- **Model:** one vanilla store per deal (like Valtio's proxy per deal), holding plain immutable data with an `actions` object inside. Global stores for tabs, options and the two switches.
- **Writes:** `writePaths` routes the batch with the shared rules and applies it in **one `set`**. Product data comes from `planProductWrites(...).data`, which copies only the path to what changed. When nothing changes there is no `set` at all. Any product change marks the price outdated in that same `set`.
- **Derived values** are selectors, not state (Zustand state can't hold getters). `issuesOf(data)` is cached per data object in a `WeakMap`, so an edit re-validates only the product it touched.
- **Change detection** (`pathDeal.ts`): one subscription compares object identity, so a product whose data object is new has changed.
- **Autocalc:** subscribes to the deal, options and switch stores.
- **Persistence:** the switches use the `persist` middleware.
- **Devtools:** Redux DevTools come from Zustand's own `devtools` middleware, including time travel. `devtools.ts` only adds `?debug` logging.
- **Gotchas:**
  - A `set` with a partial always notifies, even when nothing changed, so skip the `set` instead.
  - Listeners run synchronously in subscription order, and an earlier listener can `set` again. Compare with what you saw last, not with `prev`.
  - Load options *before* the write's `set`. Otherwise autocalc sees `pending === 0` and calculates too early.
  - Two stores can't update together, so when options arrive the products are reconciled *before* the options store counts the load as done (`load(source, param, onLoaded)`). The other order lets autocalc price data the reconcile is about to change, which costs an extra, superseded request.
  - Put `persist` outside `devtools`: `persist`'s own `setState` drops the action name.
  - Time travel restores from JSON. Each store's `serialize.replacer` leaves out the actions, deal stores and stream, and NaN comes back as `null`.

## Jotai (`src-jotai/`)

- **Model:** atoms in atoms in Jotai's default store, with no Provider (like Valtio's module globals).
  - A deal is a plain object of atoms: deal fields, settings, group ids, groups and calc.
  - Each group has a `uiAtom`. Each product has a `dataAtom` and a derived `issuesAtom`.
  - Readiness, hedge types and the deal-wide error flag are derived atoms.
- **Writes:** every action is a write atom, exposed as `actions.x = (...) => store.set(xAtom, ...)`. Jotai flushes listeners once at the end of the outermost write, so a paste is one update. A product's `dataAtom` is set only when the shared rules report a change.
- **Change detection** (`pathDeal.ts`): `store.sub` on each product's `dataAtom`, on the group order, deal fields, settings and options. Issues follow from data, so they need no watch of their own.
- **Autocalc:** `store.sub` on `calcAtom`, `isReadyAtom` and the switches.
- **Persistence:** the switches use `atomWithStorage`.
- **Devtools:** Jotai's own devtools are React-only. `devtools.ts` wraps `store.set` and reports each outermost write atom by its `debugLabel` through the shared action log. There is no time travel.
- **Gotchas:**
  - Never call `store.set` inside a write atom, because it flushes the outer batch midway. Use the write's `set` (that's why options expose `loadAtom`).
  - When options arrive, their state, the products' reconcile (`onLoaded(set, options)`) and the end of the load are one write atom, so autocalc never prices data that is about to change.
  - After an `await`, each `set` is its own batch. Group follow-up writes in a write atom.
  - In Vitest the default store outlives `vi.resetModules()`. Tests stay isolated because every atom is recreated per test.
  - `atomWithStorage`'s default storage follows other browser tabs. Its `subscribe` is removed so the switches behave like the other apps (only Effector Nested syncs across tabs).
