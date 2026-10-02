import { computed } from "mobx";
import type { ZodType } from "zod";
import type { $ZodIssue } from "zod/v4/core";

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

export const noIssues: readonly $ZodIssue[] = [];

/**
 * A field model over any store value. `read` must read observables, so
 * whatever renders `value` or `issues` follows them. Validation is a lazy
 * computed: cached while shown, recomputed only when the value changes,
 * gone with the store that owns it.
 */
export const createFieldModel = ({
  read,
  commit,
  schema,
  readOnly = false,
}: {
  read: () => unknown;
  commit: (value: unknown) => void;
  schema?: ZodType;
  readOnly?: boolean;
}): FieldModel => {
  const issues = computed(() => {
    if (!schema) return noIssues;
    const result = schema.safeParse(read());
    return result.success ? noIssues : result.error.issues;
  });

  return {
    get value() {
      return read();
    },
    get issues() {
      return issues.get();
    },
    readOnly,
    commit,
  };
};
