import { z } from "zod";

const FIXING_SOURCES_URL = "https://jsonplaceholder.typicode.com/users";

// only the fields we use; anything else in the response is dropped
const responseSchema = z.array(z.object({ id: z.number(), name: z.string() }));

export type FixingSourceOption = z.infer<typeof responseSchema>[number];

const inFlight = new Map<string, Promise<FixingSourceOption[]>>();

/**
 * Fixing source options for a settlement style: the endpoint's users, as
 * `id` + `name`, requested with `?settlementStyle=…`. Concurrent requests for
 * the same style share one call (e.g. a broadcast changing every product at
 * once); every later call fetches again.
 */
export const fetchFixingSources = (
  settlementStyle: string,
): Promise<FixingSourceOption[]> => {
  const pending = inFlight.get(settlementStyle);
  if (pending) return pending;

  const request = (async () => {
    const url = new URL(FIXING_SOURCES_URL);
    url.searchParams.set("settlementStyle", settlementStyle);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fixing sources: HTTP ${response.status}`);
    }
    return responseSchema.parse(await response.json());
  })().finally(() => inFlight.delete(settlementStyle));

  inFlight.set(settlementStyle, request);
  return request;
};

/** The value a product stores for an option: its id, as a string. */
export const toFixingSourceValue = (option: FixingSourceOption) =>
  String(option.id);

/**
 * The fixing source to keep once new options arrive: the current one if it
 * is still an option, otherwise the first option (`""` if there are none).
 */
export const reconcileFixingSource = (
  current: string,
  options: readonly FixingSourceOption[],
): string => {
  const values = options.map(toFixingSourceValue);
  return values.includes(current) ? current : (values[0] ?? "");
};
