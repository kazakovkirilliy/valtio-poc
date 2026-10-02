# Deal editor: five store implementations

This fork includes upstream `mohamad-qb/valtio-poc` through `ca95290`, together with Jotai and Zustand implementations of the expanded editor. The landing page links to all five versions:

| Version | Page | Source |
| --- | --- | --- |
| Valtio | `/valtio.html` | [src-valtio](src-valtio) |
| MobX | `/mobx.html` | [src-mobx](src-mobx) |
| Effector | `/effector.html` | [src-effector](src-effector) |
| Jotai | `/jotai.html` | [store](src-jotai/stores/store.ts), [React bindings](src-jotai/stores/bindings.ts) |
| Zustand | `/zustand.html` | [store](src-zustand/stores/store.ts), [React bindings](src-zustand/stores/bindings.ts) |

The upstream Valtio, MobX and Effector source trees are retained. Jotai and Zustand share presentational components and pure domain definitions in [src-shared](src-shared), while each owns its native state, actions and subscriptions. The previous `/?store=valtio`, `/?store=jotai` and `/?store=zustand` links redirect to their corresponding pages.

## Run

Use Node.js 24+ and pnpm:

```sh
pnpm install
pnpm dev
pnpm test
pnpm build
```

Open the Vite URL and select a version. All five HTML entries are included in production builds. Each page owns an in-memory workspace; navigating between versions or reloading creates a fresh workspace. Jotai and Zustand preserve deals and group counts when switching deal tabs, and persist their spot-stream preferences under separate localStorage keys.

## Features aligned with upstream

- **Groups:** Vanilla Group contains one Vanilla Product, Strategy contains two Vanilla Products, and Average contains one Average Product.
- **Cloning/removal:** clone an entire group immediately after its source, with new group/product ids and independent local product data. Removing a group removes its products and validation, and reindexes the remaining group titles.
- **Commit-based inputs:** typing changes a local draft. Enter or blur commits the value once; sync, broadcasts and validation observe the committed value.
- **Two-way currencies:** deal Notional/Premium Ccy and every product's corresponding currency stay synchronized across all groups and both product types.
- **Broadcasts:** the other writable deal fields apply to every existing product and then clear. Repeated commands work. An empty broadcast is ignored, matching upstream. Groups created later receive current currencies and otherwise start with defaults; clones copy their source values.
- **Nested product shapes:** Vanilla uses `optionsCommon`, Average uses `avroCommon`; both have nested notional and cash-settlement values. Zustand stores these nested objects directly. Jotai models fields as atoms and derives the nested snapshot for cloning/inspection.
- **Expiry days:** a read-only derived value follows Expiry Date. Dates are stored as ISO `YYYY-MM-DD`, numbers as numbers, and empty numeric fields as `NaN`.
- **Validation:** all upstream field rules apply, including the rule that Delivery Date cannot precede Expiry Date. Updating either date rechecks that relationship. Empty optional fields are valid.
- **Spot stream:** display-only ticks update the DOM every 500 ms, outside React/store updates. Jotai/Zustand stop every stream on disconnect and reconnect without duplicate timers.

The complete aligned field list is Notional Ccy, Notional Amount, Premium Ccy, Strike, Call/Put, Buy/Sell, Ccy Pair, Expiry Date, Expiry Days, Expiry Cut, Delivery Date, Premium Date, Settlement Style, Settlement Ccy, Fixing Source, and the deal-only Spot Stream.

The original `1xxxxxx` notional starts invalid because currencies allow at most six characters. Strike allows at most three characters; amount must be positive when supplied; Call/Put, Buy/Sell and Settlement Style use the upstream enums; Ccy Pair requires six uppercase letters. Dates, Expiry Days, Expiry Cut and Fixing Source use the same upstream constraints.

## Compare the experience

Try this in each version:

1. Add Strategy and Average groups. Edit the deal Notional Ccy and leave the input: all products update. Edit the Average product's Premium Ccy and press Enter: the deal and all products update.
2. Edit a product Strike: only that product changes. Commit a deal Strike: every product changes and the deal input clears. Modify one product and repeat the same broadcast.
3. Commit an Expiry Date, then a Delivery Date before it. Delivery Date gets a validation error. Move Expiry Date earlier: the cross-field error clears and Expiry Days updates.
4. Clone Strategy. Its two products retain their respective values but receive new ids. Edit a cloned product's local field: the source remains unchanged. Remove the clone and inspect the group numbering.
5. Toggle the spot stream. In Jotai/Zustand, watch the commit badges: ticks do not change them, and editing a local field leaves unrelated fields alone.

Jotai/Zustand also expose the existing internal-deal flag and derived hedge types, and show field validation messages. Their commit badges use React Profiler in development, reset on remount, and include draft-edit commits and StrictMode behavior. Production React disables those callbacks; they are observations, not a speed benchmark.

## Native store differences

| Concern | Valtio (upstream) | Jotai | Zustand |
| --- | --- | --- | --- |
| State model | Mutable nested proxies | Primitive field atoms, derived atoms, write-only command atoms | Vanilla workspace store and one immutable store per deal |
| React read | Key/path subscriptions through `useProxyValue` / `useDealValue` | `useAtomValue(fieldAtom, { store })` | `useStore(deal, state => selectedValue)` |
| Write | Mutate a proxy leaf | `store.set(atom, value)` | `set(state => partialUpdate)` |
| Currency sync | Key subscriptions mirror nested product copies | All matching inputs address the same currency atoms | An action copies changed product paths in one update |
| Derived values | Targeted key subscriptions update derived fields | Read-only atoms track their dependencies | Actions update Expiry Days alongside Expiry Date |
| Validation | Per-field and dependency subscriptions | Derived issue atoms read only the field and needed dependencies | Update only affected issue entries, preserving unrelated references |
| Groups | Proxied ordered group/product records | Ordered group atoms and individual field atoms | Ordered group metadata plus keyed nested product state |
| Main tradeoff here | Natural nested writes with explicit subscription cleanup | Natural shared/derived fields with more atom definitions | Visible transitions with more immutable copying |

MobX demonstrates observables, computed values and actions; Effector demonstrates events, pure reducers and keyed stores. Their implementations and layouts are available alongside the original Valtio version.

### Read a product field

```ts
// Jotai — an independently addressable field atom.
const value = useAtomValue(product.fields.strike, { store });

// Zustand — a scalar selector over the product's own nested shape.
const value = useStore(deal, state =>
  readProductField(state.products[productId].data, 'strike'));
```

### Write and validate

```ts
// Jotai — both currency inputs share this atom; validation is derived.
store.set(deal.notionalCcy, 'USD');

// Zustand — one action publishes currencies and all changed products together.
deal.getState().actions.setField({ scope: 'deal', field: 'notionalCcy' }, 'USD');
```

Read each complete `store.ts` to compare group commands, cloning, broadcasts, date derivation and cleanup. The [shared view contract](src-shared/bindings.ts) supplies no common state engine or synchronization algorithm.

## Verification

The [22 parity tests](tests/storeParity.test.ts) run real Jotai/Zustand actions and cover group composition, fresh ids, clone isolation, removal/reindexing, every broadcast, two-way currencies, nested data, date derivation, cross-field validation, unrelated identities, deal isolation and stream lifecycle. Fixture tests compare the data and every validation message directly with upstream's pure Vanilla/Average product rules.

The app and tests are type-checked, and all five production pages are built. Browser verification covers committed inputs, broadcasts, mixed groups, clone/remove behavior, dates and stream controls across all five versions, plus tab retention, preference persistence and mobile scrolling for Jotai/Zustand.
