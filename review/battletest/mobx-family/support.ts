import { vi } from "vitest";
import { productPath } from "@shared/paths.ts";
import { definitionOf, productTypeOf } from "@shared/products/productRegistry.ts";

/** A product field's dot path. */
export const fieldPath = (groupId: string, product: { id: string; data: { productType: string } }, fieldId: string) =>
  productPath(groupId, product.id, (definitionOf(productTypeOf(product.data)).fieldPaths as Record<string, string>)[fieldId]);

/** An in-memory localStorage, stubbed globally. */
export const installLocalStorage = (initial: Record<string, string> = {}) => {
  const items = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => (items.has(key) ? items.get(key)! : null),
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
    items,
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
};

export type Sent = { name: string; type: string; args?: readonly unknown[]; state: unknown };

/**
 * A fake Redux DevTools extension on `window`: records every `init` and
 * `send`, and lets the test play the monitor (`dispatch`).
 */
export const installFakeDevtools = (search = "") => {
  const sent: Sent[] = [];
  const inits: { name: string; state: unknown }[] = [];
  const listeners = new Map<string, (message: unknown) => void>();
  const extension = {
    connect: ({ name }: { name: string }) => ({
      init: (state: unknown) => void inits.push({ name, state }),
      send: (action: { type: string; args?: readonly unknown[] } | null, state: unknown) => {
        if (action) sent.push({ name, type: action.type, args: action.args, state });
      },
      subscribe: (listener: (message: unknown) => void) => {
        listeners.set(name, listener);
        return () => listeners.delete(name);
      },
    }),
  };
  vi.stubGlobal("window", { __REDUX_DEVTOOLS_EXTENSION__: extension });
  vi.stubGlobal("location", { search });
  return {
    sent,
    inits,
    /** The monitor jumps to a state, sent as JSON like the real extension does. */
    jump: (name: string, state: unknown) =>
      listeners.get(name)!({ type: "DISPATCH", state: JSON.stringify(state), payload: { type: "JUMP_TO_STATE" } }),
    dispatch: (name: string, type: string, state?: unknown) =>
      listeners.get(name)!({ type: "DISPATCH", state: state === undefined ? undefined : JSON.stringify(state), payload: { type } }),
    names: () => [...listeners.keys()],
  };
};

/** Collects console.warn / console.error calls instead of printing them. */
export const trapConsole = () => {
  const warnings: string[] = [];
  vi.spyOn(console, "warn").mockImplementation((...args) => void warnings.push(args.map(String).join(" ")));
  vi.spyOn(console, "error").mockImplementation((...args) => void warnings.push(args.map(String).join(" ")));
  return warnings;
};
