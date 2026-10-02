import { createContext, useContext, useEffect, type PropsWithChildren } from "react";
import type { StoreBindings } from "./bindings.ts";

const StoreContext = createContext<StoreBindings | null>(null);
const DealContext = createContext<string | null>(null);

export function StoreProvider({ bindings, children }: PropsWithChildren<{ bindings: StoreBindings }>) {
  useEffect(() => bindings.connectStreams(), [bindings]);
  return <StoreContext.Provider value={bindings}>{children}</StoreContext.Provider>;
}
export function DealProvider({ id, children }: PropsWithChildren<{ id: string }>) {
  return <DealContext.Provider value={id}>{children}</DealContext.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useStoreBindings() {
  const bindings = useContext(StoreContext);
  if (!bindings) throw new Error("StoreProvider is missing");
  return bindings;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useDealId() {
  const id = useContext(DealContext);
  if (!id) throw new Error("DealProvider is missing");
  return id;
}
