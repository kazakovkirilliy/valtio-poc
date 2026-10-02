import { DealProvider, StoreProvider, useStoreBindings } from "../StoreProvider.tsx";
import type { StoreBindings } from "../bindings.ts";
import type { StoreKind } from "../domain.ts";
import { Deal } from "./Deal.tsx";
import "../editor.css";

function Workspace() {
  const bindings = useStoreBindings();
  const { dealIds, activeDealId, actions } = bindings.useWorkspace();
  return (
    <section aria-label="Deal workspace">
      <nav className="multiDeal-header" aria-label="Deals">
        {dealIds.map((id, index) => <button key={id}
          className={`button ${activeDealId === id ? "button--active" : ""}`}
          aria-pressed={activeDealId === id} onClick={() => actions.setActiveDeal(id)}>Tab {index + 1}</button>)}
        <button className="button" onClick={() => actions.addDeal()}>Add New Deal</button>
      </nav>
      <DealProvider key={activeDealId} id={activeDealId}><Deal /></DealProvider>
    </section>
  );
}

export function Editor({ bindings, kind }: { bindings: StoreBindings; kind: StoreKind }) {
  return (
    <main>
      <header className="store-bar">
        <h1>{kind === "jotai" ? "Jotai" : "Zustand"} deal editor</h1>
        <nav aria-label="Store implementation">
          <a href="/">All versions</a>
          {["valtio", "mobx", "effector", "jotai", "zustand"].map((store) =>
            <a key={store} href={`/${store}.html`} aria-current={store === kind ? "page" : undefined}>
              {{ valtio: "Valtio", mobx: "MobX", effector: "Effector", jotai: "Jotai", zustand: "Zustand" }[store]}
            </a>)}
        </nav>
        <p>Edits commit on Enter or blur. Deal broadcasts apply to every group, then clear.</p>
        <p>Field badges count development React commits. Spot ticks update directly without rendering React.</p>
      </header>
      <StoreProvider bindings={bindings}><Workspace /></StoreProvider>
    </main>
  );
}
