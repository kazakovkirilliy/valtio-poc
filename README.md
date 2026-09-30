# Scoped workspace editor

A React proof of concept for independent editable workspaces with shared fields, derived validation, bulk commands, and live updates.

The architecture uses **Jotai stores per workspace**, **Apollo Client for remote data**, and a separate frame-coalesced live display. Rows are virtualized. The repository includes comparisons against corrected Valtio and Zustand implementations, reproducible benchmarks, and behavior tests.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm bench
pnpm bench:workspace
```

Requires Node 22.12+ and pnpm 10.10.0. Benchmark timings are local store measurements; notification and React commit isolation are checked independently.

Read the [architecture](docs/architecture.md) for ownership, module boundaries, scaling costs and Apollo integration. The [decision record](docs/adr/0001-scoped-editor-state.md) compares alternatives and explains why Jotai was selected. Raw results are in [store comparison](benchmarks/results.json) and [implemented model](benchmarks/workspace-results.json).

Try adding 1,000 rows, editing a shared field from either the header or a row, broadcasting a level with Enter, and switching workspaces. Drafts survive tab switches. Removing a row clears its validation contribution. Pausing live updates or hiding a workspace stops its live source.

The browser demo uses a local live source. The [Apollo adapter](src/data/apolloGateway.ts) is tested with an actual Apollo client and a controlled link; wire the host application's generated operations and existing client to connect a real server. No server schema or endpoint is supplied by this repository. Drafts are currently held in memory; only the live-toggle preference is persisted.
