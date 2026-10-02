/** Dot-separated paths to the non-object (leaf) fields of `T`. */
export type LeafPath<T> = {
  [K in keyof T & string]: T[K] extends object
    ? `${K}.${LeafPath<T[K]>}`
    : K;
}[keyof T & string];

/** `undefined` when any segment is missing, instead of throwing. */
export const getValueByPath = (target: object, path: string): unknown => {
  return path.split(".").reduce((currentTarget, part) => {
    // @ts-expect-error YOLO
    return currentTarget?.[part];
  }, target);
};

export const setValueByPath = (
  target: object,
  path: string,
  value: unknown,
): void => {
  const parts = path.split(".");
  const lastKey = parts.pop() as string;

  const deepest = parts.reduce(
    // @ts-expect-error YOLO
    (currentTarget: Record<string, unknown>, part) => {
      // Create intermediate object if missing
      if (currentTarget[part] === undefined || currentTarget[part] === null) {
        currentTarget[part] = {};
      }
      return currentTarget[part];
    },
    target,
  );

  // @ts-expect-error YOLO
  (deepest as Record<string, unknown>)[lastKey] = value;
};

/**
 * Splits a path into the object that owns the leaf and the leaf key, so a
 * subscription can target that (nested) proxy instead of the whole store.
 */
export const resolveParent = (target: object, path: string) => {
  const parts = path.split(".");
  const key = parts.pop() as string;
  const parent = (
    parts.length ? getValueByPath(target, parts.join(".")) : target
  ) as Record<string, unknown> | undefined;
  return { parent, key };
};
