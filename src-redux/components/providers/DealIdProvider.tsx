import { createContext, useContext, type PropsWithChildren } from "react";

const DealIdContext = createContext<string | null>(null);

type DealIdProviderProps = PropsWithChildren<{
  dealId: string;
}>;

export const DealIdProvider = ({ children, dealId }: DealIdProviderProps) => (
  <DealIdContext.Provider value={dealId}>{children}</DealIdContext.Provider>
);

/** The current deal's id; components select its state from the store with it. */
// eslint-disable-next-line react-refresh/only-export-components
export const useDealId = () => {
  const dealId = useContext(DealIdContext);
  if (!dealId) throw new Error("useDealId must be used in a DealIdProvider");
  return dealId;
};
