export const noop = () => {};

export const uuid = () => crypto.randomUUID().toString();

export const getValueByPath = (target: object, path: string): unknown => {
  return path.split(".").reduce((currentTarget, part) => {
    // @ts-expect-error YOLO
    return currentTarget[part];
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
