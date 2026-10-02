# Valtio / Jotai / Zustand deal editor

Three native store implementations drive the same React components. Switch stores in the header to compare both the editing behavior and the code. Each implementation keeps independent deals in memory while you switch; reloading starts fresh deals. Only the spot-stream preference persists, under a separate localStorage key for each store.

## Run

Requires Node.js 24+ and pnpm.

```sh
pnpm install
pnpm dev
pnpm test
pnpm build
```

Open the Vite URL, or choose a version directly with `?store=valtio`, `?store=jotai`, or `?store=zustand`. Valtio is the default.

## Try the same workflow in each store

1. Add a second product. Change a deal currency, then change that currency in a product: the deal and all products stay in sync.
2. Edit a product strike: only that product changes. Type a deal strike and press Enter or leave the field: every existing product receives it, and the draft clears. Repeating the same broadcast works. Typing and then clearing a draft broadcasts an empty value. Products added later start with an empty strike.
3. Enter more than six characters in a currency or three in a strike. Product fields show Zod errors; correcting the value clears them. The original `1xxxxxx` initial notional intentionally starts invalid.
4. Toggle “Internal deal” to switch derived hedge types between `abc` and `def`.
5. Add another deal and switch tabs. Values and product counts survive. Switch store implementations and come back: each retains its own workspace.
6. Watch the spot stream and field commit badges. Spot ticks run every 500 ms without notifying the state stores or rendering React. Toggle the stream to pause it. Switching implementations stops the previous implementation's timers; returning resumes its counters.

The commit badges use React Profiler in the development build. They reset when fields remount, include development/StrictMode behavior, and are observations rather than a performance benchmark. React's normal production build disables Profiler callbacks, so use `pnpm dev` for this comparison. Inspect a local strike edit to see which fields commit; currency edits intentionally affect all matching inputs.

## Where the implementations differ

| Concern | Valtio | Jotai | Zustand |
| --- | --- | --- | --- |
| State model | Nested mutable proxies | Independent field atoms and derived atoms | One vanilla workspace store and one store per deal |
| React read | `useSnapshot(deal)`; read the needed properties | `useAtomValue(fieldAtom, { store })` | `useStore(deal, state => state.products[id].strike)` |
| Write | Mutate a proxy inside an action | `store.set(atom, value)` or a write-only action atom | `set(state => ({ ... }))` inside an action |
| Two-way currencies | An action mutates the deal and all product copies | Deal and product inputs use the same currency atoms | An action copies the changed products in one update |
| Validation | Stored issues updated with the field | Read-only atoms derive issues from field atoms | Stored issues included in the field's immutable update |
| Derived hedge types | Calculate from the snapshot's `isInternal` | A read-only atom depends on `isInternal` | Calculate from a selected `isInternal` boolean |
| Subscription work | Property access tracking handles most field selection | Atom boundaries define dependencies | Explicit selectors define subscriptions; selected references must be stable |
| Main tradeoff here | Simple nested writes; mutations must keep invariants intact | Natural shared/derived fields; more atom definitions and references | Visible transitions; more copying for nested state |

These are choices in this example, not restrictions of the libraries. The original mirror effects were replaced with explicit currency actions in Valtio and Zustand, and shared atoms in Jotai, to make the invariant synchronous and avoid effect feedback loops. Strike broadcasts are explicit commands rather than retained deal state in all three.

### Reading one product strike

```ts
// Valtio — properties accessed on the snapshot determine the subscription.
const snap = useSnapshot(deal);
const strike = snap.products[productId].strike;

// Jotai — this field has an independently addressable atom.
const strike = useAtomValue(product.fields.strike, { store });

// Zustand — subscribe to the selected scalar, rather than the whole deal.
const strike = useStore(deal, state => state.products[productId].strike);
```

### Updating a field

```ts
// Valtio — mutation on a tracked proxy, inside the real setField action.
product[field] = value;

// Jotai — writing a shared currency atom updates all currency consumers.
store.set(field, value);

// Zustand — the real local-strike action replaces only the affected product.
set(state => ({
  products: {
    ...state.products,
    [productId]: updateProduct(state.products[productId], 'strike', value),
  },
}));
```

For currencies, read the complete actions: Valtio and Zustand also update other products and validation. Jotai has no duplicated currency state to synchronize.

## Source map

| Files | Purpose |
| --- | --- |
| [Valtio store](src/stores/valtio/store.ts), [React bindings](src/stores/valtio/bindings.ts) | Proxy mutations and snapshot property reads |
| [Jotai store](src/stores/jotai/store.ts), [React bindings](src/stores/jotai/bindings.ts) | Primitive/derived/write-only atoms and atom subscriptions |
| [Zustand store](src/stores/zustand/store.ts), [React bindings](src/stores/zustand/bindings.ts) | Immutable actions and scalar selectors |
| [View contract](src/stores/bindings.ts), [providers](src/contexts/StoreProvider.tsx) | Connect the identical UI to each native implementation |
| [Domain](src/stores/domain.ts) | Shared types, initial values, validation rules and storage helpers |
| [Spot stream](src/stores/spotPriceStream.ts) | Shared display stream with lifecycle cleanup |
| [Parity tests](tests/storeParity.test.ts) | The same scenarios executed against all three native stores |

The view contract keeps the UI identical; it doesn't supply a shared state engine or synchronization algorithm. Each `store.ts` owns its state and actions, and each `bindings.ts` shows the library's native React subscription API. Action consumers don't subscribe to state just to dispatch an action. LocalStorage handling and the display-only stream are intentionally identical across versions, so their infrastructure doesn't skew the comparison.

Tests cover deal isolation, two-way currencies, local/repeated/empty broadcasts, validation boundaries, unrelated field identities, internal state, stream isolation, timer cleanup and reconnection.

API references: [Valtio snapshots](https://valtio.dev/docs/api/basic/useSnapshot), [Jotai atoms](https://jotai.org/docs/core/atom), [Jotai stores](https://jotai.org/docs/core/store), [Zustand useStore](https://zustand.docs.pmnd.rs/reference/hooks/use-store.html), [Zustand updates](https://zustand.docs.pmnd.rs/learn/guides/updating-state.html).
