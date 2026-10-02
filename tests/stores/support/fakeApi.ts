import { vi } from "vitest";

const FIXING_SOURCES_URL = "https://jsonplaceholder.typicode.com/users";

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

type Listed = { id: number; name: string };

/** A fake fixing-sources API: a list per settlement style, with delays and failures under test control. */
export type FakeApi = {
  lists: Record<string, Listed[]>;
  delays: Record<string, number>;
  failing: Set<string>;
  /** The settlementStyle of every request, in order. */
  requests: string[];
};

export const installFakeApi = (lists: Record<string, Listed[]> = {}): FakeApi => {
  const api: FakeApi = { lists, delays: {}, failing: new Set(), requests: [] };
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    if (`${url.origin}${url.pathname}` !== FIXING_SOURCES_URL) {
      throw new Error(`Unexpected request: ${url}`);
    }
    const style = url.searchParams.get("settlementStyle") ?? "";
    api.requests.push(style);
    await sleep(api.delays[style] ?? 5);
    if (api.failing.has(style)) return new Response("{}", { status: 500 });
    // extra fields must be dropped by the app's response validation
    return Response.json(
      (api.lists[style] ?? []).map((option) => ({ ...option, email: "dropped" })),
    );
  });
  return api;
};
