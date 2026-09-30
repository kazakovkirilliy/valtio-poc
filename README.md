# Scoped workspace editor

A React proof of concept preserving the parent UI: tabs, one deal column, and N wrapping product columns with shared fields, derived validation, bulk commands, and live updates.

The architecture uses **Jotai stores per workspace**, **Apollo Client for remote data**, and a separate frame-coalesced live display. Product columns are virtualized in responsive groups. The repository includes comparisons against corrected Valtio and Zustand implementations, reproducible benchmarks, and behavior tests.

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

Try adding 1,000 products, editing a shared field from either the deal or a product column, broadcasting from the deal Strike field with Enter, and switching tabs. Drafts survive tab switches. Removing a product clears its validation contribution. Pausing live updates or hiding a deal stops its live source. Scrolling keeps the deal controls mounted while product columns are virtualized.

The browser demo uses a local live source. The [Apollo adapter](src/data/apolloGateway.ts) is tested with an actual Apollo client and a controlled link; wire the host application's generated operations and existing client to connect a real server. No server schema or endpoint is supplied by this repository. Drafts are currently held in memory; only the live-toggle preference is persisted.

Three [caption-only overview videos](docs/videos/README.md) explain Valtio, Zustand, and the selected Jotai/Apollo architecture, including their advantages and disadvantages. Open the [video gallery](docs/videos/index.html) through the dev server to watch them. Production builds serve the gallery at `/videos/index.html`; `vercel.json` configures the Vite build and includes these assets.
