import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DealAdapter, appNames, createAdapter } from "./support/adapters.ts";
import { installFakeApi } from "./support/fakeApi.ts";

const RULE = "Delivery date can't be before expiry date";

describe.each(appNames)("%s deal", (app) => {
  let deal: DealAdapter;

  beforeEach(async () => {
    installFakeApi(); // products load fixing sources on creation: empty lists
    deal = await createAdapter(app);
    deal.addGroup("VanillaGroup");
    deal.addGroup("Strategy");
    deal.addGroup("Average");
  });
  afterEach(() => {
    deal.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const all = () => Array.from({ length: deal.productCount() }, (_, i) => i);

  it("builds groups with typed, numbered products", () => {
    expect(deal.groupTitles()).toEqual(["Vanilla Group #1", "Strategy #2", "Average #3"]);
    expect(deal.groupProductTitles(1)).toEqual(["Vanilla Product #1", "Vanilla Product #2"]);
    expect(deal.groupProductTitles(2)).toEqual(["Average Product #1"]);
    expect(deal.productType(3)).toBe("AverageProduct");
    expect(deal.product(3).dataKeys()).toContain("avroCommon");
    expect(deal.product(3).dataKeys()).not.toContain("optionsCommon");
    expect(deal.product(0).dataKeys()).toContain("optionsCommon");
  });

  it("syncs Notional/Premium Ccy both ways, Average included", () => {
    deal.sync("premiumCcy", "EUR");
    expect(all().map((i) => deal.read(i, "premiumCcy"))).toEqual(["EUR", "EUR", "EUR", "EUR"]);
    deal.commit(3, "notionalCcy", "USD");
    expect(deal.dealValue("notionalCcy")).toBe("USD");
    expect(all().map((i) => deal.read(i, "notionalCcy"))).toEqual(["USD", "USD", "USD", "USD"]);
  });

  it("broadcasts every field to every product and keeps nothing on the deal", () => {
    const broadcasts: Record<string, unknown> = {
      strike: "12", callPut: "Call", buySell: "Buy", ccyPair: "EURUSD",
      expiryDate: "2999-01-01", expiryCut: "NY10", deliveryDate: "2999-01-03",
      premiumDate: "2999-01-02", notionalAmount: 1000, settlementStyle: "Cash",
      settlementCcy: "EUR", settlementFixingSource: "7",
    };
    for (const [fieldId, value] of Object.entries(broadcasts)) {
      deal.broadcast(fieldId, value);
      expect(deal.dealValue(fieldId)).toBeUndefined();
    }
    for (const i of all()) {
      for (const [fieldId, value] of Object.entries(broadcasts)) expect(deal.read(i, fieldId)).toBe(value);
      expect(deal.read(i, "expiryDays")).toBeGreaterThan(0); // derived from the broadcast date
    }
    deal.broadcast("strike", ""); // empty: ignored
    expect(all().map((i) => deal.read(i, "strike"))).toEqual(["12", "12", "12", "12"]);
    deal.commit(2, "strike", "99"); // products stay editable on their own
    expect(deal.read(1, "strike")).toBe("12");
  });

  it("derives Expiry Days, read-only", () => {
    deal.commit(0, "expiryDate", "2999-01-01");
    expect(deal.read(0, "expiryDays")).toBeGreaterThan(0);
    deal.commit(0, "expiryDays", 5); // ignored
    expect(deal.read(0, "expiryDays")).toBeGreaterThan(0);
    deal.commit(0, "expiryDate", "2000-01-01");
    expect(deal.read(0, "expiryDays")).toBeLessThan(0);
    expect(deal.issues(0, "expiryDays")).toEqual(["Expiry date is in the past"]);
    expect(deal.read(1, "expiryDays")).toBeNaN(); // other products untouched
  });

  it("validates fields, for both product kinds", () => {
    expect(deal.hasValidationErrors()).toBe(true); // the deal's default ccy is 7 characters
    deal.sync("notionalCcy", "USD");
    expect(deal.hasValidationErrors()).toBe(false);
    deal.commit(3, "strike", "1234");
    expect(deal.issues(3, "strike")).toEqual(["Must be at most 3 characters"]);
    expect(deal.hasValidationErrors()).toBe(true);
    deal.commit(3, "strike", "1");
    expect(deal.issues(3, "strike")).toEqual([]);
    deal.commit(1, "notionalAmount", NaN); // a cleared number is allowed
    expect(deal.issues(1, "notionalAmount")).toEqual([]);
    deal.commit(1, "notionalAmount", -5);
    expect(deal.issues(1, "notionalAmount")).toEqual(["Must be greater than 0"]);
    deal.commit(0, "settlementStyle", "Weekly");
    expect(deal.issues(0, "settlementStyle").length).toBe(1);
  });

  it.each([0, 3])("checks Delivery Date against Expiry Date (product %i)", (i) => {
    const flagged = (fieldId: string) => deal.issues(i, fieldId).includes(RULE);
    deal.commit(i, "expiryDate", "2999-02-10");
    deal.commit(i, "deliveryDate", "2999-02-05");
    expect(flagged("deliveryDate")).toBe(true);
    expect(flagged("expiryDate")).toBe(false); // shown on delivery only
    deal.commit(i, "expiryDate", "2999-02-01"); // the *other* field changes
    expect(flagged("deliveryDate")).toBe(false);
    deal.commit(i, "expiryDate", "2999-02-05"); // same day is fine
    expect(flagged("deliveryDate")).toBe(false);
    deal.commit(i, "expiryDate", "2999-03-01");
    expect(flagged("deliveryDate")).toBe(true);
    deal.commit(i, "deliveryDate", ""); // an empty date never fails
    expect(flagged("deliveryDate")).toBe(false);
  });

  it("re-checks the date rule when the deal broadcasts a date", () => {
    deal.commit(0, "deliveryDate", "2999-03-02");
    deal.broadcast("expiryDate", "2999-06-01");
    expect(deal.issues(0, "deliveryDate")).toContain(RULE);
    deal.broadcast("deliveryDate", "2999-06-02");
    expect(all().some((i) => deal.issues(i, "deliveryDate").includes(RULE))).toBe(false);
  });

  it("clones a group right after the original, as an independent copy", () => {
    deal.commit(2, "strike", "99");
    const originalIds = deal.productIdsOfGroup(1);
    deal.cloneGroup(1);
    expect(deal.groupTitles()).toEqual(["Vanilla Group #1", "Strategy #2", "Strategy #3", "Average #4"]);
    expect(deal.productIdsOfGroup(1)).toEqual(originalIds);
    expect(deal.productIdsOfGroup(2)).not.toEqual(originalIds); // new ids
    expect(deal.groupProductTitles(2)).toEqual(["Vanilla Product #1", "Vanilla Product #2"]);
    expect(deal.read(4, "strike")).toBe("99"); // copied by position
    deal.commit(4, "strike", "8");
    expect(deal.read(2, "strike")).toBe("99"); // independent
    deal.commit(3, "expiryDate", "2000-01-01");
    expect(deal.read(3, "expiryDays")).toBeLessThan(0);
    expect(deal.read(1, "expiryDays")).toBeNaN(); // own derived field
    deal.broadcast("strike", "6");
    expect(all().map((i) => deal.read(i, "strike"))).toEqual(["6", "6", "6", "6", "6", "6"]);
    deal.cloneGroup(3);
    expect(deal.groupTitles()).toEqual(["Vanilla Group #1", "Strategy #2", "Strategy #3", "Average #4", "Average #5"]);
    expect(deal.product(6).dataKeys()).toContain("avroCommon");
  });

  it("removes a group: renumbered, and its products are gone for good", () => {
    deal.sync("notionalCcy", "USD"); // no errors left
    deal.commit(1, "strike", "1234"); // an error inside the group to remove
    expect(deal.hasValidationErrors()).toBe(true);
    const removed = deal.product(1);
    deal.removeGroup(1);
    expect(deal.groupTitles()).toEqual(["Vanilla Group #1", "Average #2"]);
    expect(deal.hasValidationErrors()).toBe(false); // its errors went with it
    deal.broadcast("strike", "4");
    deal.sync("premiumCcy", "GBP");
    expect(removed.read("strike")).toBe("1234"); // no broadcasts
    expect(removed.read("premiumCcy")).not.toBe("GBP"); // no syncs
    deal.removeGroup(99); // unknown: ignored
    expect(deal.groupCount()).toBe(2);
  });

  it("can remove every group and start again", () => {
    for (let i = deal.groupCount() - 1; i >= 0; i--) deal.removeGroup(i);
    expect(deal.groupCount()).toBe(0);
    expect(deal.productCount()).toBe(0);
    deal.addGroup("Average");
    expect(deal.groupTitles()).toEqual(["Average #1"]);
  });
});
