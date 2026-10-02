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
 * A rule across fields, reported on the field it is attached to. Whatever
 * `isValid` reads is tracked, so it re-runs when any of those fields change.
 */
export type CrossFieldRule<T> = {
  message: string;
  isValid: (product: T) => boolean;
};

/**
 * A field model over any store value. `read` must read observables, so
 * whatever renders `value` or `issues` follows them. Validation (the schema,
 * then any cross-field `rules`) is a lazy computed: cached while shown,
 * recomputed only when something it read changes, gone with the store that
 * owns it.
 */
export const createFieldModel = ({
  read,
  commit,
  schema,
  rules = [],
  readOnly = false,
}: {
  read: () => unknown;
  commit: (value: unknown) => void;
  schema?: ZodType;
  /** Cross-field rules, already bound to their product. */
  rules?: readonly { message: string; isValid: () => boolean }[];
  readOnly?: boolean;
}): FieldModel => {
  const issues = computed(() => {
    const value = read();
    const result = schema?.safeParse(value);
    const found: $ZodIssue[] =
      result && !result.success ? [...result.error.issues] : [];
    for (const rule of rules) {
      if (rule.isValid()) continue;
      found.push({ code: "custom", path: [], message: rule.message, input: value });
    }
    return found.length ? found : noIssues;
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
