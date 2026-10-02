import { subscribeKey } from "valtio/utils";
import type { DealStore } from "./dealStore.ts";
import type { $ZodIssue } from "zod/v4/core";
import type { ZodType } from "zod";
import { resolveParent, type LeafPath } from "../lib/path.ts";

/** `validationErrors` key for a field path relative to the deal. */
export const toValidationKey = (path: string) => path.replaceAll(".", "_");

/**
 * A rule across fields, reported on the field it is attached to. It re-runs
 * when that field or any `dependsOn` field (paths from the product) changes.
 */
export type CrossFieldRule<T> = {
  dependsOn: LeafPath<T>[];
  message: string;
  isValid: (productStore: T) => boolean;
};

const isSameIssues = (a?: $ZodIssue[], b?: $ZodIssue[]) => {
  if (!a && !b?.length) return true;
  if (!a || !b) return false;
  return (
    a.length === b.length && a.every((i, idx) => i.message === b[idx].message)
  );
};

export const validateFieldFactory = <T extends object>(
  $dealStore: DealStore,
  productStore: T,
  productPath: string, // the product's path from the deal
) => {
  const ownerOf = (path: string) => {
    const { parent, key } = resolveParent(productStore, path);
    if (!parent) throw new Error(`validateField: no parent for "${path}"`);
    return { parent, key };
  };

  /**
   * Per-field validation: runs once now, then only when this product's own
   * field — or a field one of its `rules` depends on — changes; never on
   * unrelated deal or product changes. The field's schema and its rules are
   * checked together, so one entry holds all of the field's issues.
   * `path` is relative to the product and may be nested (`a.b.c`); each
   * subscription is placed on the nested proxy that owns the leaf key.
   * Returns the unsubscribe.
   */
  const validateField = (
    path: LeafPath<T>,
    schema: ZodType,
    rules: readonly CrossFieldRule<T>[] = [],
  ) => {
    const fullPath = toValidationKey(`${productPath}.${path}`);
    const { parent, key } = ownerOf(path);

    const validate = () => {
      const value = parent[key];
      const result = schema.safeParse(value);
      const issues: $ZodIssue[] = result.success ? [] : [...result.error.issues];
      for (const rule of rules) {
        if (rule.isValid(productStore)) continue;
        issues.push({ code: "custom", path: [], message: rule.message, input: value });
      }

      // Only write if the content actually changed — avoids new
      // array identities and needless notifications.
      const prev = $dealStore.validationErrors[fullPath];
      if (isSameIssues(prev, issues)) return;

      $dealStore.validationErrors[fullPath] = issues;
    };

    validate();
    const unsubscribes = [path, ...rules.flatMap((rule) => rule.dependsOn)].map(
      (watched) => {
        const owner = ownerOf(watched);
        return subscribeKey(owner.parent, owner.key, validate, true);
      },
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  };

  return validateField;
};

/** Drops every validation entry under `path` (e.g. a removed group). */
export const clearValidationErrors = ($dealStore: DealStore, path: string) => {
  const prefix = toValidationKey(`${path}.`);
  for (const key of Object.keys($dealStore.validationErrors)) {
    if (key.startsWith(prefix)) delete $dealStore.validationErrors[key];
  }
};
