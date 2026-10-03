import { computed } from "mobx";
import type { $ZodIssue } from "zod/v4/core";
import { noIssues } from "@shared/validation.ts";

/**
 * A field as observers read it: its value and its issues. Read inside a
 * reaction or `observer`, MobX re-runs only when this field's own value or
 * issues change. Writes go through the deal (`writePaths`), by path.
 */
export type FieldModel = {
  readonly value: unknown;
  readonly issues: readonly $ZodIssue[];
  readonly readOnly?: boolean;
};

/**
 * A field model over any store value. `read` must read observables, so
 * whatever reads `value` or `issues` follows them. `issues` becomes a lazy
 * computed: cached while observed, recomputed only when something it read
 * changes (the field, or a field its rules read), gone with its store.
 */
export const createFieldModel = ({
  read,
  issues = () => noIssues,
  readOnly = false,
}: {
  read: () => unknown;
  issues?: () => readonly $ZodIssue[];
  readOnly?: boolean;
}): FieldModel => {
  const cachedIssues = computed(issues);
  return {
    get value() {
      return read();
    },
    get issues() {
      return cachedIssues.get();
    },
    readOnly,
  };
};
