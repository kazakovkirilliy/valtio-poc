import { computed } from "mobx";
import type { $ZodIssue } from "zod/v4/core";
import { noIssues } from "@shared/validation.ts";

/**
 * What an input binds to. Components read `value` and `issues` inside
 * `observer`, so MobX re-renders an input only when its own value or issues
 * change — no path strings, store subscriptions or snapshot hooks.
 */
export type FieldModel = {
  readonly value: unknown;
  readonly issues: readonly $ZodIssue[];
  readonly readOnly?: boolean;
  commit(value: unknown): void;
};

/**
 * A field model over any store value. `read` must read observables, so
 * whatever renders `value` or `issues` follows them. `issues` becomes a lazy
 * computed: cached while shown, recomputed only when something it read
 * changes (the field, or a field its rules read), gone with its store.
 */
export const createFieldModel = ({
  read,
  commit,
  issues = () => noIssues,
  readOnly = false,
}: {
  read: () => unknown;
  commit: (value: unknown) => void;
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
    commit,
  };
};
