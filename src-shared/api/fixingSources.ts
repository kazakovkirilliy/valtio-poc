import { z } from "zod";
import { type Option, defineOptionsSource } from "../options/optionsSource.ts";

const FIXING_SOURCES_URL = "https://jsonplaceholder.typicode.com/users";

// only the fields we use; anything else in the response is dropped
const responseSchema = z.array(z.object({ id: z.number(), name: z.string() }));

const fetchFixingSources = async (settlementStyle: string): Promise<Option[]> => {
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
