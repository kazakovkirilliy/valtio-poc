import type { $ZodIssue } from "zod/v4/core";
import type { ProductFieldId } from "./fields.ts";
import { getValueByPath } from "./lib/path.ts";
import type { GenericProductDefinition, ProductData } from "./products/productRegistry.ts";

export type FieldIssues = Partial<Record<ProductFieldId, readonly $ZodIssue[]>>;

export const noIssues: readonly $ZodIssue[] = [];

/**
 * One field's issues: its schema, then its cross-field rules. Pure, so each
 * app decides when to run it (a subscription, a computed, a derived store).
 */
export const fieldIssues = (
  definition: GenericProductDefinition,
  fieldId: ProductFieldId,
  data: ProductData,
): readonly $ZodIssue[] => {
  const value = getValueByPath(data, definition.fieldPaths[fieldId]);
  const result = definition.schemas[fieldId].safeParse(value);
  const issues: $ZodIssue[] = result.success ? [] : [...result.error.issues];
  for (const rule of definition.rules?.[fieldId] ?? []) {
    if (!rule.isValid(data)) {
      issues.push({ code: "custom", path: [], message: rule.message, input: value });
    }
  }
  return issues.length ? issues : noIssues;
};

/** Every field's issues for one product (fields without issues are left out). */
export const productIssues = (
  definition: GenericProductDefinition,
  data: ProductData,
): FieldIssues => {
  const issues: FieldIssues = {};
  for (const fieldId of Object.keys(definition.schemas) as ProductFieldId[]) {
    const found = fieldIssues(definition, fieldId, data);
    if (found.length) issues[fieldId] = found;
  }
  return issues;
};

/** The fields a field's validation reads besides itself (its rules' dependencies). */
export const validationDependencies = (
  definition: GenericProductDefinition,
  fieldId: ProductFieldId,
): readonly ProductFieldId[] =>
  (definition.rules?.[fieldId] ?? []).flatMap((rule) => rule.dependsOn);
