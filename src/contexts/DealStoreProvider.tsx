import { createContext, useContext, type PropsWithChildren } from "react";
import type { DealStore } from "../stores/dealStore.ts";
import { useSnapshot } from "valtio/react";

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

export const useDealStoreSnapshot = () => {
  const dealStore = useContext(DealStoreContext);
  return useSnapshot(dealStore);
};
