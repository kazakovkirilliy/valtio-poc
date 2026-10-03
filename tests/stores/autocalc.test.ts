import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DealAdapter, appNames, createAdapter } from "./support/adapters.ts";
import { type FakeApi, installFakeApi, sleep } from "./support/fakeApi.ts";

// fake latencies in tests: fixing sources 5ms (the fake API), a calculation 20ms
describe.each(appNames)("%s autocalc", (app) => {
  let deal: DealAdapter;
  let api: FakeApi;

  beforeEach(async () => {
    api = installFakeApi({ Cash: [{ id: 4, name: "C4" }] });
    deal = await createAdapter(app);
    deal.addGroup("VanillaGroup"); // one product: the fake price is 1 + its notional / 1000
  });
  afterEach(() => {
    deal.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const status = () => deal.calc().status;

  it("calculates nothing while the deal has validation errors", async () => {
    deal.setAutocalc(true);
    await sleep(60);
    expect(deal.hasValidationErrors()).toBe(true); // the default ccy is 7 characters
    expect(status()).toBe("none");
    deal.calculate(); // not ready: ignored
    expect(status()).toBe("none");
  });

  it("calculates once the deal is valid and no request is pending", async () => {
    deal.setAutocalc(true);
    deal.sync("notionalCcy", "USD"); // valid, but the deal's Cash options are still loading
    expect(status()).toBe("none");
    await sleep(12);
    expect(status()).toBe("calculating");
    await sleep(40);
    expect(deal.calc()).toEqual({ status: "done", price: 1 });
  });

  it("recalculates on every edit; an invalid edit leaves the price outdated", async () => {
    deal.setAutocalc(true);
    deal.sync("notionalCcy", "USD");
    await sleep(60);
    deal.commit(0, "notionalAmount", 1000);
    await sleep(1);
    expect(status()).toBe("calculating");
    deal.commit(0, "notionalAmount", 2000); // supersedes the calculation in flight
    await sleep(40);
    expect(deal.calc()).toEqual({ status: "done", price: 3 });
    deal.commit(0, "strike", "1234"); // invalid
    await sleep(40);
    expect(deal.calc()).toEqual({ status: "outdated", price: 3 });
    deal.commit(0, "strike", "1");
    await sleep(40);
    expect(deal.calc()).toEqual({ status: "done", price: 3 });
  });

  it("waits for a slow fixing source before calculating", async () => {
    deal.setAutocalc(true);
    deal.sync("notionalCcy", "USD");
    await sleep(60);
    api.delays.Cash = 60;
    deal.commit(0, "settlementStyle", "Cash");
    await sleep(30);
    expect(status()).toBe("outdated"); // the Cash options are still loading
    await sleep(80);
    expect(deal.calc()).toEqual({ status: "done", price: 1 });
  });

  it("with autocalc off, only Calculate calculates; turning it on catches up", async () => {
    deal.sync("notionalCcy", "USD");
    await sleep(60);
    expect(status()).toBe("none");
    deal.calculate();
    expect(status()).toBe("calculating");
    await sleep(40);
    expect(deal.calc()).toEqual({ status: "done", price: 1 });
    deal.commit(0, "notionalAmount", 1000);
    await sleep(40);
    expect(deal.calc()).toEqual({ status: "outdated", price: 1 });
    deal.setAutocalc(true);
    await sleep(40);
    expect(deal.calc()).toEqual({ status: "done", price: 2 });
  });
});
