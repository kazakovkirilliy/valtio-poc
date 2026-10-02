import { z } from "zod";

const SETTLEMENT_STYLES_URL = "https://jsonplaceholder.typicode.com/users";

// only the fields we use; anything else in the response is dropped
const responseSchema = z.array(z.object({ id: z.number(), name: z.string() }));

export type SettlementStyleOption = z.infer<typeof responseSchema>[number];

/** Settlement style options: the endpoint's users, as `id` + `name`. */
export const fetchSettlementStyles = async (): Promise<
  SettlementStyleOption[]
> => {
  const response = await fetch(SETTLEMENT_STYLES_URL);
  if (!response.ok) {
    throw new Error(`Settlement styles: HTTP ${response.status}`);
  }
  return responseSchema.parse(await response.json());
};

/** The value a product stores for an option: its id, as a string. */
export const toSettlementStyleValue = (option: SettlementStyleOption) =>
  String(option.id);
