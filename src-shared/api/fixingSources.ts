import { z } from "zod";
import { delay, fakeLatency } from "../lib/delay.ts";
import { type Option, defineOptionsSource } from "../options/optionsSource.ts";

const FIXING_SOURCES_URL = "https://jsonplaceholder.typicode.com/users";
const FIXING_SOURCES_LATENCY_MS = fakeLatency(1000);

// only the fields we use; anything else in the response is dropped
const responseSchema = z.array(z.object({ id: z.number(), name: z.string() }));

const fetchFixingSources = async (settlementStyle: string): Promise<Option[]> => {
  // the real endpoint answers too fast to see loading (no latency: request at once)
  if (FIXING_SOURCES_LATENCY_MS > 0) await delay(FIXING_SOURCES_LATENCY_MS);
  const url = new URL(FIXING_SOURCES_URL);
  url.searchParams.set("settlementStyle", settlementStyle);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fixing sources: HTTP ${response.status}`);
  return responseSchema
    .parse(await response.json())
    .map(({ id, name }) => ({ value: String(id), label: name }));
};

/** Fixing source options for a settlement style: the endpoint's users. */
export const fixingSources = defineOptionsSource("fixingSources", fetchFixingSources);
