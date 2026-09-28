import { useDealStoreSnapshot } from "../contexts/DealStoreProvider.tsx";

export const useValidationError = (path: string) => {
  const snap = useDealStoreSnapshot();

  return snap.validationErrors[path];
};
