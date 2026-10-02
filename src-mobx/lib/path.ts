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
