import { afterEach, describe, expect, it, vi } from "vitest";
import { calcFailed, calcInputsChanged, calcStarted, calcSucceeded, initialCalcState, type CalcState } from "@shared/calc.ts";
import { initialDealFields, isEmptyBroadcast } from "@shared/dealFields.ts";
import { initialDealSettings, withSetting } from "@shared/dealSettings.ts";
import { routeWrites } from "@shared/dealWrites.ts";
import { fields } from "@shared/fields.ts";
import { parseCellText, parseNumber } from "@shared/grid/cellValues.ts";
import { parseTsv, toTsv } from "@shared/grid/clipboard.ts";
import { nextInOrder } from "@shared/grid/navigation.ts";
import { pasteWrites } from "@shared/grid/paste.ts";
import { dateInDays, daysUntil } from "@shared/lib/date.ts";
import { deleteValueByPath, setIn, setValueByPath } from "@shared/lib/path.ts";
import { optionsLoading, reconcileOption } from "@shared/options/optionsSource.ts";
import { type DealChange, createChangeHub } from "@shared/pathDeal.ts";
import { productPath } from "@shared/paths.ts";
import { defineProduct } from "@shared/products/productDefinition.ts";
import { type ProductData, productDefinitions } from "@shared/products/productRegistry.ts";
import { planProductWrite } from "@shared/products/productWrites.ts";
import { vanillaProduct } from "@shared/products/vanillaProduct.ts";
import { productIssues } from "@shared/validation.ts";
import { bug } from "./support.ts";

/**
 * Pure, adversarial tests of src-shared. `bug(...)` tests state the spec'd
 * behaviour and are `it.fails`: they PASS while the bug reproduces.
 */

const proto = Object.prototype as Record<string, unknown>;
afterEach(() => {
  delete proto.polluted;
  vi.useRealTimers();
});

const vanilla = (): ProductData => vanillaProduct.createData(initialDealFields) as ProductData;

describe("lib/path", () => {
  bug("setValueByPath must not write into Object.prototype through __proto__", () => {
    setValueByPath({ a: 1 }, "__proto__.polluted", "yes");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  bug("setValueByPath must not write into Object.prototype through constructor.prototype", () => {
    setValueByPath({ a: 1 }, "constructor.prototype.polluted", "yes");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  bug("deleteValueByPath must not delete from Object.prototype through __proto__", () => {
    proto.polluted = "keep me";
    deleteValueByPath({}, "__proto__.polluted");
    expect(proto.polluted).toBe("keep me");
  });

  it("setIn does not pollute, but makes an own '__proto__' key out of the prototype's contents", () => {
    const next = setIn({ a: 1 }, "__proto__.polluted", "yes") as Record<string, unknown>;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(next)).toEqual(["a", "__proto__"]);
  });

  bug("setIn into a leaf string must not turn it into an object of its characters", () => {
    const next = setIn({ strike: "12" }, "strike.x", 1) as Record<string, unknown>;
    expect(next.strike).toBe("12"); // observed: { 0: "1", 1: "2", x: 1 }
  });

  it("DIVERGENCE: the mutating twin throws on the same write (strict-mode write to a primitive)", () => {
    expect(() => setValueByPath({ strike: "12" }, "strike.x", 1)).toThrow(TypeError);
    expect(() => setValueByPath({ amount: NaN }, "amount.x", 1)).toThrow(TypeError);
  });

  bug("setIn writing undefined at a missing path is a no-op (same object)", () => {
    const target = {};
    expect(setIn(target, "a.b", undefined)).toBe(target); // observed: { a: {} }, a "change"
  });
});

describe("lib/date", () => {
  const timeZones = [
    "UTC",
    "America/New_York",
    "Europe/London",
    "Australia/Lord_Howe", // 30-minute DST
    "America/Sao_Paulo", // 2018-11-04: local midnight skipped
    "Pacific/Apia", // 2011-12-30 skipped entirely
    "Asia/Kathmandu",
    "Pacific/Kiritimati", // UTC+14: local date ahead of UTC
    "Pacific/Pago_Pago", // UTC-11: local date behind UTC
  ];
  const days = [
    [2026, 2, 8], [2026, 10, 1], [2026, 2, 29], [2026, 9, 25], [2026, 3, 5], [2026, 9, 4],
    [2018, 10, 4], [2019, 1, 16], [2011, 11, 29], [2011, 11, 31], [2024, 1, 29], [2026, 11, 31],
  ];
  const times = [[0, 0, 1], [0, 30, 0], [1, 59, 59], [2, 30, 0], [12, 0, 0], [23, 59, 59]];
  const pad = (n: number) => String(n).padStart(2, "0");

  it("daysUntil and dateInDays agree with the local calendar, across DST, skipped days and far time zones", () => {
    const originalTz = process.env.TZ;
    const failures: string[] = [];
    try {
      vi.useFakeTimers({ toFake: ["Date"] });
      for (const tz of timeZones) {
        process.env.TZ = tz;
        for (const [y, m, d] of days) {
          for (const [h, mi, s] of times) {
            const now = new Date(y, m, d, h, mi, s);
            vi.setSystemTime(now);
            const local = new Date();
            const today = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
            if (dateInDays(0) !== today) failures.push(`${tz} ${local.toString()}: dateInDays(0)=${dateInDays(0)} != ${today}`);
            for (let n = -400; n <= 400; n += 7) {
              if (daysUntil(dateInDays(n)) !== n) failures.push(`${tz} ${local.toString()}: round trip ${n}`);
            }
          }
        }
      }
    } finally {
      process.env.TZ = originalTz;
    }
    expect(failures).toEqual([]);
  });

  bug("dateInDays never throws for a finite number (typing 1000000000 into Expiry Days)", () => {
    expect(() => dateInDays(1e9)).not.toThrow(); // observed: RangeError: Invalid time value
  });

  bug("dateInDays returns an ISO date or nothing (typing 3000000 into Expiry Days)", () => {
    expect(dateInDays(3_000_000)).toMatch(/^(\d{4}-\d{2}-\d{2})?$/); // observed: "+010240-01" or similar
  });

  bug("daysUntil reads years 0000-0099 as written, not as 19xx", () => {
    expect(daysUntil("0050-06-15")).toBeLessThan(-700_000); // observed: days until 1950-06-15
  });

  bug("daysUntil of an impossible calendar date is NaN, not a count to the rolled-over date", () => {
    expect(daysUntil("2026-02-30")).toBeNaN(); // observed: days until 2026-03-02 (the schema flags the date itself)
    expect(daysUntil("2026-13-01")).toBeNaN(); // observed: days until 2027-01-01
  });

  it("OBSERVED: a non-number Expiry Days (a string by path) clears the expiry date", () => {
    expect(dateInDays("5")).toBe("");
    const planned = planProductWrite(vanilla(), { fieldId: "expiryDate", value: "2999-01-01" });
    const next = planProductWrite(planned.data, { fieldId: "expiryDays", value: "5" }).data as { optionsCommon: { base: { expiryDate: string } } };
    expect(next.optionsCommon.base.expiryDate).toBe("");
  });

  it("OBSERVED: Expiry Days is computed once, at write time: it goes stale at midnight", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 10, 23, 59, 0));
    const data = planProductWrite(vanilla(), { fieldId: "expiryDate", value: "2026-03-11" }).data as {
      optionsCommon: { base: { expiryDays: number } };
    };
    expect(data.optionsCommon.base.expiryDays).toBe(1);
    vi.setSystemTime(new Date(2026, 2, 11, 0, 1, 0));
    expect(daysUntil("2026-03-11")).toBe(0); // the truth now
    expect(data.optionsCommon.base.expiryDays).toBe(1); // what every app that stores it still holds
  });
});

describe("grid/clipboard", () => {
  bug("the grid's own copy round-trips a column whose last cell is empty", () => {
    const rows = [["EUR"], [""]];
    expect(parseTsv(toTsv(rows))).toEqual(rows); // observed: [["EUR"]], the empty row dropped
  });

  it("round-trips every other shape of random cells (tabs, newlines, CR, quotes, empties)", () => {
    const alphabet = ["a", "b", '"', "\t", "\n", "\r", " ", "", "\r\n", '""'];
    let seed = 42;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const failures: string[] = [];
    for (let run = 0; run < 3000; run++) {
      const height = 1 + random(4);
      const width = 1 + random(4);
      const rows = Array.from({ length: height }, () =>
        Array.from({ length: width }, () => Array.from({ length: random(4) }, () => alphabet[random(alphabet.length)]).join("")),
      );
      const last = rows[rows.length - 1];
      if (rows.length > 1 && last.length === 1 && last[0] === "") continue; // the known bug above
      if (JSON.stringify(parseTsv(toTsv(rows))) !== JSON.stringify(rows)) failures.push(JSON.stringify(rows));
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });
});

describe("grid/cellValues: number parsing", () => {
  bug("the editor parses '1,000' like paste does (the editor uses parseNumber)", () => {
    expect(parseCellText("notionalAmount", "1,000", null)).toEqual({ value: 1000 });
    expect(parseNumber("1,000")).toBe(1000); // observed: NaN, i.e. the field is cleared
  });

  bug("a European decimal comma is rejected, not read 10x too big", () => {
    expect(parseCellText("notionalAmount", "1,5", null)).toBeNull(); // observed: { value: 15 }
  });

  bug("a European thousands separator is rejected, not read as a decimal", () => {
    expect(parseCellText("notionalAmount", "1.000,50", null)).toBeNull(); // observed: { value: 1.0005 }
  });

  it("OBSERVED: what else a number cell accepts", () => {
    const parsed = Object.fromEntries(
      ["1e3", "-5", "0x10", "0b101", "Infinity", "  42  ", "1,,0", ",5", "1 000", "$1,000", "(1,000)"].map((text) => [
        text,
        parseCellText("notionalAmount", text, null)?.value ?? "skipped",
      ]),
    );
    expect(parsed).toEqual({
      "1e3": 1000, "-5": -5, "0x10": 16, "0b101": 5, Infinity: Infinity, "  42  ": 42, "1,,0": 10, ",5": 5,
      "1 000": "skipped", "$1,000": "skipped", "(1,000)": "skipped",
    });
  });

  bug("pasted text is trimmed for text fields too, like every other input type", () => {
    expect(parseCellText("ccyPair", " EURUSD ", null)).toEqual({ value: "EURUSD" }); // observed: " EURUSD " (then invalid)
  });

  bug("a whitespace-only broadcast counts as empty (goes nowhere)", () => {
    expect(isEmptyBroadcast("   ")).toBe(true);
  });
});

describe("pathDeal: createChangeHub", () => {
  const hub = () => {
    let emit: (change: DealChange) => void = () => {};
    const counts = { start: 0, stop: 0 };
    const subscribe = createChangeHub((e) => {
      counts.start++;
      emit = e;
      return () => {
        counts.stop++;
        emit = () => {};
      };
    });
    return { subscribe, counts, emit: (change: DealChange) => emit(change) };
  };

  it("starts with the first listener, stops with the last, and starts again for a new one", () => {
    const { subscribe, counts, emit } = hub();
    const seen: string[] = [];
    const a = subscribe(() => seen.push("a"));
    const b = subscribe(() => seen.push("b"));
    a();
    b();
    b(); // twice: harmless
    expect(counts).toEqual({ start: 1, stop: 1 });
    const c = subscribe(() => seen.push("c"));
    emit({ kind: "groups" });
    expect(counts.start).toBe(2);
    expect(seen).toEqual(["c"]);
    c();
  });

  bug("the same callback subscribed twice keeps its second subscription when the first ends", () => {
    const { subscribe, emit } = hub();
    let calls = 0;
    const listener = () => calls++;
    const first = subscribe(listener);
    subscribe(listener); // e.g. two components handed the same stable callback
    first();
    emit({ kind: "groups" });
    expect(calls).toBe(1); // observed: 0, the Set kept one entry and the first unsubscribe removed it (and stopped the stores)
  });

  bug("a start that throws doesn't leave its listener behind", () => {
    let fail = true;
    let emit: (change: DealChange) => void = () => {};
    const subscribe = createChangeHub((e) => {
      if (fail) throw new Error("store not ready");
      emit = e;
      return () => {};
    });
    let ghost = 0;
    expect(() => subscribe(() => ghost++)).toThrow("store not ready");
    fail = false;
    subscribe(() => {});
    emit({ kind: "groups" });
    expect(ghost).toBe(0); // observed: 1, the failed subscriber was never removed and has no unsubscribe
  });
});

describe("options", () => {
  bug("O7: a reload after a failed load shows Loading…, not the old failure", () => {
    expect(optionsLoading({ status: "error", options: [] }).status).toBe("loading");
  });

  bug("E4/E5: reconciling a pasted dropdown label keeps the option it names", () => {
    const options = [{ value: "4", label: "C4" }, { value: "3", label: "Shared" }];
    expect(reconcileOption("Shared", options)).toBe("3"); // observed: "4", the first option
  });
});

describe("dealSettings", () => {
  bug("S2: an Internal value that isn't one of its options is ignored", () => {
    for (const value of ["yes", "Yes", "", undefined, null, 1, "TRUE"]) {
      expect(withSetting(initialDealSettings, "isInternal", value)).toEqual(initialDealSettings); // observed: { isInternal: false, hedgeType: "d" }
    }
  });

  bug("a setting written with its current value returns the same settings object (as withDealField does)", () => {
    expect(withSetting(initialDealSettings, "isInternal", true)).toBe(initialDealSettings);
    expect(withSetting(initialDealSettings, "hedgeType", "a")).toBe(initialDealSettings);
  });

  bug("S2: the settings column pasted in display order (Hedge Type above Internal) keeps the pasted hedge type", () => {
    const routed = routeWrites(
      { dealFields: initialDealFields, settings: initialDealSettings, products: [] },
      [{ path: "hedgeType", value: "e" }, { path: "isInternal", value: "false" }], // rows 2, 3: what a paste sends
    );
    expect(routed.settings).toEqual({ isInternal: false, hedgeType: "e" }); // observed: hedgeType "d"
  });
});

describe("calc: the requestId protocol", () => {
  it("only ever shows a price computed from the current inputs (random interleavings)", () => {
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let run = 0; run < 2000; run++) {
      let state: CalcState = initialCalcState;
      let version = 0;
      const inFlight: { id: number; version: number }[] = [];
      for (let step = 0; step < 30; step++) {
        const op = random(4);
        if (op === 0) {
          state = calcInputsChanged(state);
          version++;
        } else if (op === 1) {
          const id = state.requestId + 1;
          state = calcStarted(state, id);
          inFlight.push({ id, version });
        } else if (inFlight.length) {
          const [request] = inFlight.splice(random(inFlight.length), 1);
          state = op === 2 ? calcSucceeded(state, request.id, request.version) : calcFailed(state, request.id);
        }
        if (state.status === "done") expect(state.price).toBe(version);
        if (state.status === "calculating") expect(inFlight.some(({ id }) => id === state.requestId)).toBe(true);
      }
    }
  });
});

describe("deal logic and routing", () => {
  const oneProduct = () => {
    const data = vanilla();
    return { dealFields: initialDealFields, settings: initialDealSettings, products: [{ groupId: "g", productId: "p", data }] };
  };

  bug("P4/P6: a ccy pair written to a product the deal doesn't have changes nothing", () => {
    const routed = routeWrites(oneProduct(), [
      { path: productPath("nope", "nope", "optionsCommon.base.ccyPair"), value: "EURUSD" },
    ]);
    expect(routed.dealFields.notionalCcy).toBe("1xxxxxx"); // observed: "EUR", synced to every real product
  });

  bug("P2: within one batch, a later explicit Notional Ccy beats the ccy pair's base currency", () => {
    const routed = routeWrites(oneProduct(), [
      { path: "ccyPair", value: "EURUSD" },
      { path: "notionalCcy", value: "JPY" }, // typed after the pair, in the same paste
    ]);
    expect(routed.dealFields.notionalCcy).toBe("JPY"); // observed: "EUR", the reducer's change is appended last
  });

  bug("P3: a write to the object holding a synced field still syncs (or is refused)", () => {
    const routed = routeWrites(oneProduct(), [
      { path: productPath("g", "p", "optionsCommon.base.notional"), value: { notionalCcy: "EUR", amount: 5 } },
    ]);
    expect(routed.dealFields.notionalAmount).toBe(5); // observed: NaN; the product alone gets the object
  });

  bug("O1/P3: a write to the object holding the Fixing Source can't create it on a Delivery product", () => {
    const routed = routeWrites(oneProduct(), [
      { path: productPath("g", "p", "cashSettlement"), value: { settlementCcy: "", settlementFixingSource: "4" } },
    ]);
    const [write] = routed.products.get("p")!.writes;
    const data = planProductWrite(oneProduct().products[0].data, write).data as { cashSettlement: object };
    expect(data.cashSettlement).not.toHaveProperty("settlementFixingSource");
  });

  bug("P4: writing productType by path is refused (it re-types the product and breaks every later read)", () => {
    const routed = routeWrites(oneProduct(), [{ path: productPath("g", "p", "productType"), value: "Nope" }]);
    const data = planProductWrite(oneProduct().products[0].data, routed.products.get("p")!.writes[0]).data;
    expect(() => planProductWrite(data, { fieldId: "strike", value: "1" })).not.toThrow(); // observed: TypeError (no definition)
  });
});

describe("validation", () => {
  bug("validation survives an object written as null by path (P4: written as is)", () => {
    const data = planProductWrite(vanilla(), { path: "optionsCommon", value: null }).data;
    expect(() => productIssues(vanillaProduct as never, data)).not.toThrow(); // observed: TypeError in the deliveryDate rule
  });
});

describe("field configs: defineProduct", () => {
  const config = vanillaProduct as unknown as Parameters<typeof defineProduct>[0];
  const vanillaFields = (override: Record<string, string> = {}) =>
    Object.entries(vanillaProduct.fieldPaths).map(([field, path]) => ({
      props: { path: `groups.$GROUP_ID.products.$PRODUCT_ID.data.${override[field] ?? path}` },
      position: { field },
    }));

  bug("F7: a field path that isn't in the product's data fails on load", () => {
    expect(() =>
      defineProduct({ ...config, label: "Typo", fields: vanillaFields({ strike: "optionsCommon.strik" }) } as never),
    ).toThrow(); // observed: loads; the Strike cell then reads undefined forever
  });

  bug("a derived field whose write targets itself fails on load, not with a stack overflow on first edit", () => {
    const cyclic = {
      ...config,
      label: "Cyclic",
      fields: vanillaFields(),
      derived: { expiryDays: { dependsOn: ["expiryDate"], compute: () => 0, write: (value: unknown) => ({ fieldId: "expiryDays", value }) } },
    };
    let loaded: unknown;
    try {
      loaded = defineProduct(cyclic as never);
    } catch {
      return; // the spec'd behaviour
    }
    const registry = productDefinitions as Record<string, unknown>;
    const original = registry.VanillaProduct;
    registry.VanillaProduct = loaded;
    try {
      expect(() => planProductWrite(vanilla(), { fieldId: "expiryDays", value: 1 })).not.toThrow(); // observed: RangeError: Maximum call stack size exceeded
    } finally {
      registry.VanillaProduct = original;
    }
  });
});

describe("grid/paste and navigation", () => {
  bug("E5: cells clipped at the grid's edge are reported as skipped", () => {
    const { writes, skipped } = pasteWrites({
      data: [["1", "2"], ["3", "4"]],
      range: { fromRow: fields.length - 1, fromCell: 3, toRow: fields.length - 1, toCell: 3 }, // the last row and column
      rowCount: fields.length,
      dataCells: [0, 2, 3],
      cellAt: (row, cell) => ({ ref: { columnId: `c${cell}`, fieldId: "strike" as never }, view: { value: "", hasError: false, readOnly: false } }),
    });
    expect([writes.length, skipped]).toEqual([1, 3]); // observed: [1, 0], "Pasted 1 cell"
  });

  it("nextInOrder terminates and returns null when no cell can be stopped at", () => {
    expect(nextInOrder(0, 0, 1, { first: 0, count: 50 }, () => [0, 1, 2, 3], () => false)).toBeNull();
    expect(nextInOrder(0, 0, -1, { first: 0, count: 50 }, () => [], () => true)).toBeNull();
  });
});
