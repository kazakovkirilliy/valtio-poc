/** Dot-separated paths to the non-object (leaf) fields of `T`. */
export type LeafPath<T> = {
  [K in keyof T & string]: T[K] extends object
    ? `${K}.${LeafPath<T[K]>}`
    : K;
}[keyof T & string];

/** `undefined` when any segment is missing, instead of throwing. */
export const getValueByPath = (target: object, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (current, part) => (current as Record<string, unknown> | undefined)?.[part],
      target,
    );

/** Mutating set; creates intermediate objects if missing. */
export const setValueByPath = (
  target: object,
  path: string,
  value: unknown,
): void => {
  const parts = path.split(".");
  const lastKey = parts.pop() as string;
  const parent = parts.reduce((current, part) => {
    current[part] ??= {};
    return current[part] as Record<string, unknown>;
  }, target as Record<string, unknown>);
  parent[lastKey] = value;
};

/**
 * Immutable set: returns a copy with `value` at `path`, copying only the
 * objects along the path (structural sharing). Writing the value a field
 * already has returns `target` itself, so stores see no change.
 */
export const setIn = <T extends object>(
  target: T,
  path: string,
  value: unknown,
): T => {
  const [head, ...rest] = path.split(".");
  const current = (target as Record<string, unknown>)[head];
  const next = rest.length
    ? setIn((current ?? {}) as object, rest.join("."), value)
    : value;
  if (Object.is(current, next)) return target;
  return { ...target, [head]: next };
};

/**
 * Splits a path into the object that owns the leaf and the leaf key, so a
 * subscription can target that (nested) object instead of the whole store.
 */
export const resolveParent = (target: object, path: string) => {
  const parts = path.split(".");
  const key = parts.pop() as string;
  const parent = (
    parts.length ? getValueByPath(target, parts.join(".")) : target
  ) as Record<string, unknown> | undefined;
  return { parent, key };
};
