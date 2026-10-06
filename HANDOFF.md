# Handoff: Legend-State and Redux versions

State as of 2026-10-06. Both apps are complete and passing, **but not
committed** (`git status` shows them as new files and edits).

## What was added

- **Legend-State** (`src-legend-state/`, `@legendapp/state@3.0.0-beta.48`)
- **Redux** (`src-redux/`, `@reduxjs/toolkit` 2.13.0 + `react-redux` 9.3.0)

Both are registered everywhere an app must be (see "Adding an app" in
`CLAUDE.md`), linked from the landing page, and covered by the shared test
suites plus one library-specific test each in `tests/stores/libraries.test.ts`.

Last verified: `npx tsc -b` clean; `pnpm test` 317/317; Playwright
`-g "legend-state|redux|landing page"` all passing (19 per app).

## Legend-State: design

- The whole app is one observable tree of plain data: every deal sits under
  `multiTab$.deals[dealId]`. Each deal's actions and computeds live beside the
  tree in `dealStores` (a `Map`), because computeds aren't data.
- Group titles aren't stored: they follow from `groupIds`.
- Writes: the shared rules plan each product write; the store sets the changed
  leaves one by one inside a `batch`. Listeners get the changed paths, so one
  `onChange` on `groups` tells the grid which products changed (path segment 2).
- Validation: one `computed` per field, which reads (tracks) only the leaves
  its rules depend on (`validationDependencies`), then validates the plain data.
- The two switches persist with Legend-State's own `syncObservable` +
  `ObservablePersistLocalStorage`.
- Devtools: Legend-State has no actions, so each batch of changes is reported,
  named by its paths. No time travel.

### Gotchas (keep these)

- **Legend-State writes into the stored objects in place.** Never put a shared
  object (e.g. `initialCalcState`) into the tree; `initialDealState()` copies
  them.
- **Computed values can be stale while a batch is still notifying listeners.**
  Autocalc therefore only schedules a microtask and checks again once
  everything has settled (`queueMicrotask(autocalc)` in `dealStore.ts`).
  Without it, an invalid edit could start a calculation before the deal
  reports its validation error (an autocalc store test caught this).
- **A removed product's computeds still fire** when its data is deleted, so the
  validation computed returns no issues once the data is gone. Those computeds
  aren't disposed; they just never run again.
- Setting `NaN` over `NaN` counts as a change in Legend-State, so writes are
  applied only where the shared rules report a change.

## Redux: design

- One store: `tabs`, `deals`, `options`, `devtools`, all plain immutable data.
  Titles, validation issues and readiness are derived (`selectors.ts`).
- Actions are events (`actions.ts`: `pathsWritten`, `groupInserted`,
  `optionsReceived`, ...). Every slice that cares handles the same action in
  one dispatch, so e.g. an edit and its pending options load land together.
  That's why Redux needs no microtask workaround for autocalc.
- Thunks (`thunks.ts`) do only what reducers can't: new ids, requests, and
  routing path writes (routing reads the state). Reducers apply the result.
  "Any product change outdates the price" is reducer logic.
- Autocalc: one listener-middleware listener in `store.ts`.
- Validation: `issuesOf(data)` is cached per data object in a `WeakMap`; an
  edit is a new object, so only the edited product is re-validated.
- Clones share their source's data objects (safe: nothing is changed in place).
- Spot price streams live outside the store (thunk `extraArgument`); a store
  subscription starts/stops them with the switch.
- Switches persist to localStorage in `stores/app.ts`.
- Redux DevTools come from `configureStore` in dev builds, so time travel
  should work (the store is all the state).

## Open items

- Commit the work (nothing from these two apps is committed yet).
- Redux DevTools time travel hasn't been tried with the extension.
- Legend-State is on a beta (`3.0.0-beta.48`); check for a stable v3 before
  relying on it.
- Redux reconciles arriving options across every deal, not just the deal that
  asked. Equivalent today (reconciling a valid value changes nothing), but it
  differs from the other apps.
- Small leftovers outside this work: `playwright.config.ts` still says "all
  three apps", and `README.md` is the Vite template.
