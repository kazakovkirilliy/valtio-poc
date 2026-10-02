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
