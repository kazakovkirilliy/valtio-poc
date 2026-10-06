import { createContext, useContext, type PropsWithChildren } from "react";
import type { DealStore } from "../../stores/dealStore.ts";

const DealStoreContext = createContext<DealStore | null>(null);

type DealStoreProviderProps = PropsWithChildren<{
  currentDeal: DealStore;
}>;

export const DealStoreProvider = ({
  children,
  currentDeal,
}: DealStoreProviderProps) => (
  <DealStoreContext.Provider value={currentDeal}>
    {children}
  </DealStoreContext.Provider>
);

/** The current deal; components read its observables with `useValue` to subscribe. */
// eslint-disable-next-line react-refresh/only-export-components
export const useDealStore = () => {
  const deal = useContext(DealStoreContext);
  if (!deal) throw new Error("useDealStore must be used in a DealStoreProvider");
  return deal;
};
