import { createContext, useContext, type PropsWithChildren } from "react";
import type { DealStore } from "../../stores/dealStore.ts";

const DealStoreContext = createContext<DealStore>(
  undefined as unknown as DealStore,
);

type DealStoreProviderProps = PropsWithChildren<{
  currentDeal: DealStore;
}>;
export const DealStoreProvider = ({
  children,
  currentDeal,
}: DealStoreProviderProps) => {
  return (
    <DealStoreContext.Provider value={currentDeal}>
      {children}
    </DealStoreContext.Provider>
  );
};

// a plain object of atoms: reading it subscribes to nothing
// eslint-disable-next-line react-refresh/only-export-components
export const useDealStore = () => useContext(DealStoreContext);
