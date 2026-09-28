import { useDealStoreSnapshot } from "../contexts/DealStoreProvider.tsx";
import { getValueByPath } from "../utils/utils.ts";
import type { $ZodIssue } from "zod/v4/core";

export const useValidationError = (path: string) => {
  const snap = useDealStoreSnapshot();

  const issues = getValueByPath(
    snap,
    `validationErrors.${path.replaceAll(".", "_")}`,
  ) as $ZodIssue[] | undefined;

  const hasError = !!issues?.length;

  return { hasError, issues };
};
