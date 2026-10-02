import "./App.css";
import { MultiDeal } from "./components/MultiDeal.tsx";
import { useState } from "react";
import { StoreProvider } from "./contexts/StoreProvider.tsx";
import type { StoreKind } from "./stores/domain.ts";
import { valtioBindings } from "./stores/valtio/bindings.ts";
import { jotaiBindings } from "./stores/jotai/bindings.ts";
import { zustandBindings } from "./stores/zustand/bindings.ts";

const implementations = {
  valtio: {
    label: "Valtio",
    description: "Mutable proxies · subscriptions follow the properties read from a snapshot.",
    example: "deal.products[id].strike = value",
    bindings: valtioBindings,
  },
  jotai: {
    label: "Jotai",
    description: "Field atoms · shared currency atoms and derived validation dependencies.",
    example: "store.set(product.fields.strike, value)",
    bindings: jotaiBindings,
  },
  zustand: {
    label: "Zustand",
    description: "Immutable state · explicit actions and selectors for each field.",
    example: "deal.getState().actions.setField(path, value)",
    bindings: zustandBindings,
  },
};

function initialStore(): StoreKind {
  const value = new URLSearchParams(window.location.search).get("store");
  return value === "jotai" || value === "zustand" ? value : "valtio";
}

function App() {
  const [kind, setKind] = useState<StoreKind>(initialStore);
  const selected = implementations[kind];
  const selectStore = (next: StoreKind) => {
    setKind(next);
    const url = new URL(window.location.href);
    url.searchParams.set("store", next);
    window.history.replaceState(null, "", url);
  };
  return (
    <main>
      <header className="comparison-header">
        <h1>Store comparison</h1>
        <p>The same deal editor, implemented three ways.</p>
        <nav className="store-switcher" aria-label="Store implementation">
          {(Object.keys(implementations) as StoreKind[]).map((option) => (
            <button key={option}
              className={`button ${kind === option ? "button-active" : ""}`}
              aria-pressed={kind === option} onClick={() => selectStore(option)}>
              {implementations[option].label}
            </button>
          ))}
        </nav>
        <p className="store-description">{selected.description}</p>
        <code>{selected.example}</code>
        <p className="comparison-note">
          Each store keeps its own deals while you switch. Field badges count React commits;
          the spot stream updates its input directly. See README.md for the code comparison.
        </p>
      </header>
      <StoreProvider key={kind} bindings={selected.bindings}>
        <MultiDeal />
      </StoreProvider>
    </main>
  );
}
export default App;
