/**
 * The original app's boolean conditions (`BoolLogicProps`), as field configs
 * write them. Only equality for now: `[path, value]` holds when the value
 * at `path` is `value`. This file is where the original evaluator goes
 * (and/or/not, some/every/contains, …): the stores and the grid only call
 * the two functions below.
 */
export type BoolLogic<Path extends string = string> = readonly [path: Path, value: unknown];

/** Whether the condition holds, reading values through `read`. */
export const evaluateBoolLogic = (logic: BoolLogic, read: (path: string) => unknown) =>
  Object.is(read(logic[0]), logic[1]);

/** Every path the condition reads: it is evaluated again when one of them changes. */
export const boolLogicPaths = (logic: BoolLogic): string[] => [logic[0]];

/** The same condition with every path rewritten (e.g. made relative to a product's data). */
export const mapBoolLogicPaths = (logic: BoolLogic, map: (path: string) => string): BoolLogic => [
  map(logic[0]),
  logic[1],
];
