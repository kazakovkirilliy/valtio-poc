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

export const setValueByPath = (
  target: object,
  path: string,
  value: unknown,
): void => {
  const parts = path.split(".");
  const lastKey = parts.pop() as string;
  const parent = parts.reduce((current, part) => {
    // create intermediate objects if missing
    current[part] ??= {};
    return current[part] as Record<string, unknown>;
  }, target as Record<string, unknown>);
  parent[lastKey] = value;
};

/**
 * Immutable `setValueByPath`: returns a copy with `value` at `path`, copying
 * only the objects along the path (structural sharing). Writing the value a
 * field already has returns `target` itself, so stores see no change.
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
