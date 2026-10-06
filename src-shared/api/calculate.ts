import { delay, fakeLatency } from "../lib/delay.ts";
import { type ProductData, readField } from "../products/productRegistry.ts";

const CALC_LATENCY_MS = fakeLatency(2000, 20);

/**
 * A fake pricing request: the deal's price, after a slow round trip. The
 * price is read from the products when the request is made, like a request
 * body, so edits made while it is in flight don't change it.
 */
export const calculatePrice = async (
  products: readonly ProductData[],
): Promise<number> => {
  const price = products.reduce(
    (sum, data) => sum + 1 + (Number(readField(data, "notionalAmount")) || 0) / 1000,
    0,
  );
  await delay(CALC_LATENCY_MS);
  return Math.round(price * 100) / 100;
};
