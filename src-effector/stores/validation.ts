import type { ZodType } from "zod";
import type { $ZodIssue } from "zod/v4/core";
import { getValueByPath } from "../lib/path.ts";
import type { ProductFieldId } from "./fields.ts";

/** A product's issues, per field. */
export type FieldIssues = Partial<Record<ProductFieldId, readonly $ZodIssue[]>>;

/**
 * A rule across fields, reported on the field it is listed under. It is a
 * plain function of the product's data, so it is re-checked whenever the
 * product changes — there are no dependencies to declare.
 */
export type CrossFieldRule<Data> = {
  message: string;
  isValid: (data: Data) => boolean;
};

/**
 * Validates one product's data: every field against its schema, then the
 * cross-field rules. Pure — the product module supplies its own paths,
 * schemas and rules, so this knows no field names.
 */
export const validateData = <Data extends object>(
  data: Data,
  fieldPaths: Record<ProductFieldId, string>,
  schemas: Record<ProductFieldId, ZodType>,
  rules: Partial<Record<ProductFieldId, CrossFieldRule<Data>[]>>,
): FieldIssues => {
  const issuesByField: FieldIssues = {};
  for (const fieldId of Object.keys(schemas) as ProductFieldId[]) {
    const value = getValueByPath(data, fieldPaths[fieldId]);
    const result = schemas[fieldId].safeParse(value);
    const issues: $ZodIssue[] = result.success ? [] : [...result.error.issues];
    for (const rule of rules[fieldId] ?? []) {
      if (rule.isValid(data)) continue;
      issues.push({ code: "custom", path: [], message: rule.message, input: value });
    }
    if (issues.length) issuesByField[fieldId] = issues;
  }
  return issuesByField;
};
