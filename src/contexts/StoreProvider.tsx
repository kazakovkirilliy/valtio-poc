import { createContext, useContext, useEffect, type PropsWithChildren } from "react";
import type { StoreBindings } from "../stores/bindings.ts";

const StoreContext = createContext<StoreBindings | null>(null);
const DealContext = createContext<string | null>(null);

export function StoreProvider({ bindings, children }: PropsWithChildren<{ bindings: StoreBindings }>) {
  useEffect(() => bindings.connectStreams(), [bindings]);
  return <StoreContext.Provider value={bindings}>{children}</StoreContext.Provider>;
}

export function DealProvider({ dealId, children }: PropsWithChildren<{ dealId: string }>) {
  return <DealContext.Provider value={dealId}>{children}</DealContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStoreBindings() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreProvider is missing");
  return store;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDealId() {
  const id = useContext(DealContext);
  if (!id) throw new Error("DealProvider is missing");
  return id;
}
