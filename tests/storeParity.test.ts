import assert from "node:assert/strict";
import { test } from "node:test";
import { subscribe } from "valtio/vanilla";
import { createValtioWorkspace } from "../src/stores/valtio/store.ts";
import { createJotaiWorkspace } from "../src/stores/jotai/store.ts";
import { createZustandWorkspace } from "../src/stores/zustand/store.ts";
import {
  productFields, type DealActions, type ProductValues, type WorkspaceActions,
} from "../src/stores/domain.ts";
import type { SpotPriceStream } from "../src/stores/spotPriceStream.ts";

type DealProbe = {
  actions: DealActions;
  productIds(): readonly string[];
  currency(field: "notionalCcy" | "premiumCcy"): string;
  product(id: string): ProductValues;
  isInternal(): boolean;
  stream: SpotPriceStream;
  subscribe(listener: () => void): () => void;
};
type WorkspaceProbe = {
  actions: WorkspaceActions;
  dealIds(): readonly string[];
  activeDealId(): string;
  streamEnabled(): boolean;
  deal(id: string): DealProbe;
  connectStreams(): () => void;
};

// Adapt only test observations. Tests execute each library's real actions.
const factories: Record<string, () => WorkspaceProbe> = {
  Valtio() {
    const { workspace, connectStreams } = createValtioWorkspace();
    return {
      actions: workspace.actions,
      dealIds: () => workspace.dealIds,
      activeDealId: () => workspace.activeDealId,
      streamEnabled: () => workspace.streamEnabled,
      connectStreams,
      deal(id) {
        const deal = workspace.deals[id];
        return {
          actions: deal.actions,
          productIds: () => deal.productIds,
          currency: (field) => deal[field],
          product: (productId) => deal.products[productId],
          isInternal: () => deal.isInternal,
          stream: deal.spotPriceStream,
          subscribe: (listener) => subscribe(deal, listener, true),
        };
      },
    };
  },
  Jotai() {
    const workspace = createJotaiWorkspace();
    const { store } = workspace;
    return {
      actions: workspace.actions,
      dealIds: () => store.get(workspace.dealIds),
      activeDealId: () => store.get(workspace.activeDealId),
      streamEnabled: () => store.get(workspace.streamEnabled),
      connectStreams: workspace.connectStreams,
      deal(id) {
        const deal = workspace.getDeal(id);
        return {
          actions: workspace.getDealActions(id),
          productIds: () => store.get(deal.productIds),
          currency: (field) => store.get(deal[field]),
          product(productId) {
            const product = store.get(deal.products)[productId];
            return {
              productNotionalCcy: store.get(product.fields.productNotionalCcy),
              productPremiumCcy: store.get(product.fields.productPremiumCcy),
              strike: store.get(product.fields.strike),
              validationErrors: {
                productNotionalCcy: store.get(product.issues.productNotionalCcy),
                productPremiumCcy: store.get(product.issues.productPremiumCcy),
                strike: store.get(product.issues.strike),
              },
            };
          },
          isInternal: () => store.get(deal.isInternal),
          stream: deal.spotPriceStream,
          subscribe(listener) {
            const unsubscribers = [
              store.sub(deal.notionalCcy, listener),
              store.sub(deal.premiumCcy, listener),
              store.sub(deal.products, listener),
              store.sub(deal.isInternal, listener),
              ...Object.values(store.get(deal.products)).flatMap((product) =>
                productFields.map((field) => store.sub(product.fields[field], listener))),
            ];
            return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
          },
        };
      },
    };
  },
  Zustand() {
    const { workspace, connectStreams } = createZustandWorkspace();
    return {
      actions: workspace.getState().actions,
      dealIds: () => workspace.getState().dealIds,
      activeDealId: () => workspace.getState().activeDealId,
      streamEnabled: () => workspace.getState().streamEnabled,
      connectStreams,
      deal(id) {
        const deal = workspace.getState().deals[id];
        return {
          actions: deal.getState().actions,
          productIds: () => deal.getState().productIds,
          currency: (field) => deal.getState()[field],
          product: (productId) => deal.getState().products[productId],
          isInternal: () => deal.getState().isInternal,
          stream: deal.getState().spotPriceStream,
          subscribe: (listener) => deal.subscribe(listener),
        };
      },
    };
  },
};

for (const [name, createWorkspace] of Object.entries(factories)) {
  test(`${name}: deals are initialized once and remain isolated across tab switches`, () => {
    const workspace = createWorkspace();
    const firstId = workspace.activeDealId();
    const first = workspace.deal(firstId);
    assert.equal(workspace.dealIds().length, 1);
    assert.equal(first.productIds().length, 1);
    first.actions.setField("notionalCcy", "USD");
    const secondId = workspace.actions.addDeal();
    assert.equal(workspace.activeDealId(), secondId);
    assert.equal(workspace.deal(secondId).currency("notionalCcy"), "1xxxxxx");
    workspace.actions.setActiveDeal(firstId);
    assert.equal(first.currency("notionalCcy"), "USD");
    assert.equal(first.productIds().length, 1);
    workspace.actions.setActiveDeal("missing");
    assert.equal(workspace.activeDealId(), firstId);
  });

  test(`${name}: editing either currency syncs the deal and every product`, () => {
    const workspace = createWorkspace();
    const deal = workspace.deal(workspace.activeDealId());
    const firstId = deal.productIds()[0];
    const secondId = deal.actions.addProduct();
    for (const [dealField, productField] of [
      ["notionalCcy", "productNotionalCcy"], ["premiumCcy", "productPremiumCcy"],
    ] as const) {
      deal.actions.setField(dealField, "EUR");
      assert.equal(deal.product(firstId)[productField], "EUR");
      assert.equal(deal.product(secondId)[productField], "EUR");
      deal.actions.setField(`products.${secondId}.${productField}`, "GBP");
      assert.equal(deal.currency(dealField), "GBP");
      assert.equal(deal.product(firstId)[productField], "GBP");
      const newId = deal.actions.addProduct();
      assert.equal(deal.product(newId)[productField], "GBP");
    }
  });

  test(`${name}: strikes stay local; broadcasts repeat, clear, and aren't retained`, () => {
    const workspace = createWorkspace();
    const deal = workspace.deal(workspace.activeDealId());
    const firstId = deal.productIds()[0];
    const secondId = deal.actions.addProduct();
    deal.actions.setField(`products.${firstId}.strike`, "12");
    assert.equal(deal.product(secondId).strike, "");
    deal.actions.broadcastStrike("34");
    assert.equal(deal.product(firstId).strike, "34");
    assert.equal(deal.product(secondId).strike, "34");
    deal.actions.setField(`products.${firstId}.strike`, "56");
    deal.actions.broadcastStrike("34");
    assert.equal(deal.product(firstId).strike, "34");
    const thirdId = deal.actions.addProduct();
    assert.equal(deal.product(thirdId).strike, "");
    deal.actions.broadcastStrike("");
    assert.ok(deal.productIds().every((id) => deal.product(id).strike === ""));
  });

  test(`${name}: validation appears and clears at the same boundaries`, () => {
    const workspace = createWorkspace();
    const deal = workspace.deal(workspace.activeDealId());
    const id = deal.productIds()[0];
    assert.equal(deal.product(id).validationErrors.productNotionalCcy.length, 1);
    deal.actions.setField("notionalCcy", "123456");
    assert.equal(deal.product(id).validationErrors.productNotionalCcy.length, 0);
    deal.actions.setField(`products.${id}.productPremiumCcy`, "1234567");
    assert.equal(deal.product(id).validationErrors.productPremiumCcy[0].message, "Must be at most 6 characters");
    deal.actions.setField("premiumCcy", "USD");
    assert.equal(deal.product(id).validationErrors.productPremiumCcy.length, 0);
    deal.actions.broadcastStrike("1234");
    assert.equal(deal.product(id).validationErrors.strike[0].message, "Must be at most 3 characters");
    deal.actions.broadcastStrike("123");
    assert.equal(deal.product(id).validationErrors.strike.length, 0);
  });

  test(`${name}: a local strike keeps other fields and their validation unchanged`, () => {
    const workspace = createWorkspace();
    const deal = workspace.deal(workspace.activeDealId());
    const id = deal.productIds()[0];
    const secondId = deal.actions.addProduct();
    const beforeIssues = deal.product(id).validationErrors.productNotionalCcy;
    const beforeIds = deal.productIds();
    deal.actions.setField(`products.${id}.strike`, "1234");
    assert.equal(deal.product(id).validationErrors.productNotionalCcy, beforeIssues);
    assert.equal(deal.productIds(), beforeIds);
    assert.equal(deal.product(secondId).strike, "");
    assert.equal(deal.currency("premiumCcy"), "2");
  });

  test(`${name}: internal state can change without touching product values`, () => {
    const workspace = createWorkspace();
    const deal = workspace.deal(workspace.activeDealId());
    const id = deal.productIds()[0];
    deal.actions.setInternal(false);
    assert.equal(deal.isInternal(), false);
    assert.equal(deal.product(id).productNotionalCcy, "1xxxxxx");
    deal.actions.setInternal(true);
    assert.equal(deal.isInternal(), true);
  });

  test(`${name}: stream ticks bypass state; toggle and disconnect stop all timers`, async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    const workspace = createWorkspace();
    if (!workspace.streamEnabled()) workspace.actions.toggleSpotPriceStream();
    const deal = workspace.deal(workspace.activeDealId());
    let stateNotifications = 0;
    const unsubscribe = deal.subscribe(() => { stateNotifications += 1; });
    let disconnect = workspace.connectStreams();
    try {
      t.mock.timers.tick(500);
      assert.equal(deal.stream.getValue(), 1);
      assert.equal(stateNotifications, 0);
      const second = workspace.deal(workspace.actions.addDeal());
      await Promise.resolve(); // Valtio batches workspace notifications in a microtask.
      t.mock.timers.tick(500);
      assert.equal(second.stream.getValue(), 1);
      workspace.actions.toggleSpotPriceStream();
      await Promise.resolve();
      t.mock.timers.tick(1500);
      assert.equal(deal.stream.getValue(), 2);
      assert.equal(second.stream.getValue(), 1);
      workspace.actions.toggleSpotPriceStream();
      await Promise.resolve();
      disconnect();
      t.mock.timers.tick(1000);
      assert.equal(deal.stream.getValue(), 2);
      assert.equal(second.stream.getValue(), 1);
      disconnect = workspace.connectStreams();
      t.mock.timers.tick(500);
      assert.equal(deal.stream.getValue(), 3);
      assert.equal(second.stream.getValue(), 2);
      assert.equal(stateNotifications, 0);
    } finally {
      disconnect();
      unsubscribe();
    }
  });
}
