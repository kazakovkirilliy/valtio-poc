# ADR 0001: Scoped Jotai drafts alongside Apollo

Status: accepted for this proof of concept.

## Decision

Use Jotai field atoms within one store per workspace. Use Apollo for remote state, React for temporary UI state, and a separate React external-store channel for high-rate display values. Keep canonical shared values, explicit batched commands, lifecycle-owned subscriptions, and virtualized wrapping product columns regardless of library.

The editor contains independently changing fields, shared values, derived validation, dynamic rows, multiple concurrent drafts, and live display updates. Explicit dependency graphs fit these requirements while keeping React code small and avoiding selector and effect plumbing.

## Alternatives

| Approach | Strength | Tradeoff for this editor |
| --- | --- | --- |
| Corrected Valtio with small proxies | Excellent mutation ergonomics; efficient row subscriptions; smallest migration | Snapshot/proxy discipline and derived behavior need care; another effect layer is unnecessary |
| Zustand per workspace | Simple commands, selectors and middleware; strong general default | Workspace updates invoke subscribed selectors and copy the normalized collection unless state is further partitioned |
| Zustand per row plus shared stores | Fastest scalar writes in this microbenchmark; bounded notifications | More store instances and cross-store composition; bulk updates/derived validation need additional coordination |
| Jotai per field, scoped by workspace | Explicit narrow dependencies, derived atoms and write transactions; direct React hooks | More atom objects and higher scalar-write overhead than sharded Zustand or Valtio |
| React reducer/context alone | No state-library dependency; good for tab metadata and small local forms | A broad context value invalidates consumers; keeping 1,000 field subscriptions narrow requires splitting or building selector infrastructure |
| Redux Toolkit | Strong tooling and explicit event history; useful for complex workflows | Adds reducer/selector machinery that this editor does not need; revisit if replayable workflows become a central requirement |
| Apollo-only local state | One client cache | Mixes transient draft ownership and high-rate presentation with remote entity state; draft isolation and cache updates become harder to reason about |

Jotai is selected for composition and maintainability. It is not the universal fastest library. A corrected Valtio implementation is a defensible lower-migration alternative, and sharded Zustand is a good choice for command-heavy state with few derived relationships.

## Experimental evidence

`pnpm bench` runs seven warmed samples per variant at 10, 100 and 1,000 rows. Each sample performs 2,000 scalar edits. All variants avoid the original bidirectional synchronization. Root subscriptions deliberately use synchronous notification to expose per-logical-update subscription work; this is not the original app's end-to-end React timing.

At 1,000 rows on Node 24.20.0, the recorded median results were:

| Variant | Milliseconds / 2,000 edits | Subscription callbacks/checks |
| --- | ---: | ---: |
| Valtio, root subscriptions | 80.66 | 2,000,000 |
| Valtio, row subscriptions | 0.62 | 2,000 |
| Zustand, workspace selectors | 30.38 | 2,000,000 |
| Zustand, row stores | 0.21 | 2,000 |
| Jotai, field atoms | 1.59 | 2,000 |

The versions are Valtio 2.3.2, Zustand 5.0.15 and Jotai 3.0.1. Timings vary by machine and engine. The important result is the bounded subscription work of all three partitioned designs. The vanilla benchmark excludes snapshots, validation, actual React rendering, network work, memory comparison and initialization cost, so it cannot establish a universal library ranking. It also mounts every synthetic subscription; virtualization lowers the number of active React subscribers in the final editor.

The implemented model, including field validation and dirty tracking, separately processed 10,000 changed edits over 1,000 rows in 65.2ms in one run. It emitted 10,000 edited-field notifications and zero list notifications. A 1,000-row invalid broadcast took 5.6ms and notified the summary once. A burst of 10,000 live messages scheduled one frame and emitted one display notification. These are local store/channel measurements, not frame-time guarantees. See `benchmarks/results.json` and `benchmarks/workspace-results.json` for raw data and `tests/react.test.tsx` for a React commit-isolation probe.

## Consequences and revisit conditions

The architecture makes row subscriptions explicit and isolates draft lifecycle. Derived field errors are cached; aggregate validation does constant work on individual edits. Structural operations and bulk commands remain linear and are intentionally visible in the model.

There is no need to replace Apollo or add a second remote-data cache. Actual integration still requires the host's generated documents, mappings, endpoint configuration and server conflict policy. The demo does not persist draft data or submit requests to an assumed backend.

Revisit partition size and library choice if profiling shows many atoms becoming a material allocation cost, if most changes update entire rows together, or if command replay and audit history become central. Keep ownership, canonical state, explicit transactions, virtualization, and lifecycle cleanup even if the state library changes.
