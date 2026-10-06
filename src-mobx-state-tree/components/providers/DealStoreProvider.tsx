import { createContext, useContext, type PropsWithChildren } from "react";
import type { Deal } from "../../stores/dealModel.ts";

const DealStoreContext = createContext<Deal | null>(null);

type DealStoreProviderProps = PropsWithChildren<{
  currentDeal: Deal;
}>;

export const DealStoreProvider = ({
  children,
  currentDeal,
}: DealStoreProviderProps) => (
  <DealStoreContext.Provider value={currentDeal}>
    {children}
  </DealStoreContext.Provider>
);

/** The current deal; components read it inside `observer` to subscribe. */
// eslint-disable-next-line react-refresh/only-export-components
export const useDealStore = () => {
  const deal = useContext(DealStoreContext);
  if (!deal) throw new Error("useDealStore must be used in a DealStoreProvider");
  return deal;
};
