import type { $ZodIssue } from "zod/v4/core";
import { getValueByPath } from "./utils.ts";

/**
 * Reads a field's issues from a snapshot the caller already holds, so a
 * component tracks validation without a second store subscription.
 */
export const getValidationError = (snap: object, path: string) => {
  const issues = getValueByPath(
    snap,
    `validationErrors.${path.replaceAll(".", "_")}`,
  ) as $ZodIssue[] | undefined;

  const hasError = !!issues?.length;

  return { hasError, issues };
};
