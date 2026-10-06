// A counting wrapper for @shared/validation.ts. Used from `vi.mock` factories in the perf tests.
// No imports on purpose: the factory loads this while the mocked module is being resolved.

export type ValidationCounters = { fieldCalls: number; productCalls: number; directFieldCalls: number };

const KEY = "__perfValidationCounters";

export const validationCounters = (): ValidationCounters => {
  const g = globalThis as unknown as Record<string, ValidationCounters | undefined>;
  let counters = g[KEY];
  if (!counters) {
    counters = { fieldCalls: 0, productCalls: 0, directFieldCalls: 0 };
    g[KEY] = counters;
  }
  return counters;
};

export const resetValidationCounters = () => {
  const c = validationCounters();
  c.fieldCalls = 0;
  c.productCalls = 0;
  c.directFieldCalls = 0;
};

type AnyFn = (...args: any[]) => any;

/**
 * `fieldIssues` counts every field-level validation (fieldCalls), including the ones
 * `productIssues` makes (productIssues is re-implemented here over the counting
 * fieldIssues, so its inner calls are visible); `directFieldCalls` are the calls an app
 * makes itself, `productCalls` the whole-product validations.
 */
export const wrapValidation = <T extends { fieldIssues: AnyFn; productIssues: AnyFn }>(original: T): T => {
  const counters = validationCounters();
  const counted = (...args: Parameters<T["fieldIssues"]>) => {
    counters.fieldCalls += 1;
    return original.fieldIssues(...args);
  };
  const fieldIssues = (...args: any[]) => {
    counters.directFieldCalls += 1;
    return (counted as AnyFn)(...args);
  };
  const productIssues = (definition: { fieldPaths: Record<string, string> }, data: unknown) => {
    counters.productCalls += 1;
    const issues: Record<string, unknown> = {};
    for (const fieldId of Object.keys(definition.fieldPaths)) {
      const found = (counted as AnyFn)(definition, fieldId, data);
      if (found.length) issues[fieldId] = found;
    }
    return issues;
  };
  return { ...original, fieldIssues, productIssues };
};
