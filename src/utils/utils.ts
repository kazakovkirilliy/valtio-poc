export const noop = () => {};

export const uuid = () => crypto.randomUUID().toString();

/** Dot-separated paths to the non-object (leaf) fields of `T`. */
export type LeafPath<T> = {
  [K in keyof T & string]: T[K] extends object
    ? `${K}.${LeafPath<T[K]>}`
    : K;
}[keyof T & string];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole calendar days from today (local time) until an ISO `YYYY-MM-DD`
 * date; negative when it is in the past, `NaN` when empty or invalid.
 */
export const daysUntil = (isoDate: string): number => {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return NaN;

  const now = new Date();
  // UTC midnights on both sides so DST shifts never skew the count
  const target = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.round((target - today) / MS_PER_DAY);
};

/** `undefined` when any segment is missing, instead of throwing. */
export const getValueByPath = (target: object, path: string): unknown => {
  return path.split(".").reduce((currentTarget, part) => {
    // @ts-expect-error YOLO
    return currentTarget?.[part];
  }, target);
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

/** `validationErrors` key for a field path relative to the deal. */
export const toValidationKey = (path: string) => path.replaceAll(".", "_");

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
