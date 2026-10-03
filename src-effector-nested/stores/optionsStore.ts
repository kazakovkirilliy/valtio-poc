import { createEffect, createStore } from "effector";
import type { OptionsRequest } from "@shared/products/productWrites.ts";
import {
  type OptionsState,
  optionsFailed,
  optionsKey,
  optionsLoaded,
  optionsLoading,
} from "@shared/options/optionsSource.ts";

export type { OptionsRequest };

/** (Re)loads one list of options. */
export const loadOptionsEffect = createEffect(({ source, param }: OptionsRequest) =>
  source.load(param),
);

/** Loads several lists at once (e.g. a new group's); each settles on its own. */
export const loadAllOptionsEffect = createEffect((requests: OptionsRequest[]) =>
  Promise.allSettled(requests.map((request) => loadOptionsEffect(request))),
);

/** Writes one entry; an unchanged entry leaves the whole store unchanged. */
const withEntry = (
  byKey: Record<string, OptionsState>,
  { source, param }: OptionsRequest,
  next: (prev: OptionsState | undefined) => OptionsState,
) => {
  const key = optionsKey(source, param);
  const entry = next(byKey[key]);
  return entry === byKey[key] ? byKey : { ...byKey, [key]: entry };
};

/** Every async dropdown's options, per source and parameter; shared by every deal. */
export const $optionsByKey = createStore<Record<string, OptionsState>>({})
  .on(loadOptionsEffect, (byKey, request) => withEntry(byKey, request, optionsLoading))
  .on(loadOptionsEffect.done, (byKey, { params, result }) =>
    withEntry(byKey, params, (prev) => optionsLoaded(prev, result)),
  )
  .on(loadOptionsEffect.fail, (byKey, { params }) => withEntry(byKey, params, optionsFailed));
