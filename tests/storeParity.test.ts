import assert from "node:assert/strict";
import { test } from "node:test";
import type { Atom } from "jotai/vanilla";
import { createJotaiWorkspace } from "../src-jotai/stores/store.ts";
import { createZustandWorkspace } from "../src-zustand/stores/store.ts";
import {
  broadcastFieldIds, initialCurrencies, productFieldIds, readProductField,
  type DealActions, type FieldValue, type GroupType, type Issues, type ProductData,
  type ProductType, type WorkspaceActions,
} from "../src-shared/domain.ts";
import type { ProductFieldId } from "../src-shared/fields.ts";
import { daysUntil } from "../src-shared/date.ts";
import type { SpotPriceStream } from "../src-shared/spotPriceStream.ts";
import {
  createVanillaData, setVanillaField, validateVanilla,
} from "../src-effector/stores/products/vanillaProductStore.ts";
import {
  createAverageData, setAverageField, validateAverage,
} from "../src-effector/stores/products/averageProductStore.ts";

type ProductProbe = {
  id: string;
  type: ProductType;
  data(): ProductData;
  value(field: ProductFieldId): FieldValue;
  issues(field: ProductFieldId): Issues;
};
type GroupProbe = {
  id: string;
  type: GroupType;
  title(): string;
  index(): number;
  products(): ProductProbe[];
};
type DealProbe = {
  actions: DealActions;
  groupIds(): readonly string[];
  groups(): GroupProbe[];
  currency(field: "notionalCcy" | "premiumCcy"): FieldValue;
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

const factories: Record<string, () => WorkspaceProbe> = {
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
          groupIds: () => store.get(deal.groupIds),
          groups: () => store.get(deal.groupIds).map((id) => {
            const group = store.get(deal.groups)[id];
            return {
              id, type: group.groupType, title: () => store.get(group.ui).title,
              index: () => store.get(group.ui).index,
              products: () => group.productIds.map((id) => {
                const product = group.products[id];
                return {
                  id, type: product.summary.productType,
                  data: () => store.get(product.data),
                  value: (field) => store.get(product.fields[field]),
                  issues: (field) => store.get(product.issues[field]),
                };
              }),
            };
          }),
          currency: (field) => store.get(deal[field]),
          isInternal: () => store.get(deal.isInternal),
          stream: deal.spotPriceStream,
          subscribe(listener) {
            const atoms: Atom<unknown>[] = [deal.notionalCcy, deal.premiumCcy, deal.isInternal, deal.groups, deal.groupIds];
            const subscriptions = atoms.map((value) => store.sub(value, listener));
            for (const group of Object.values(store.get(deal.groups))) {
              for (const product of Object.values(group.products)) {
                for (const field of productFieldIds) subscriptions.push(store.sub(product.fields[field], listener));
              }
            }
            return () => subscriptions.forEach((unsubscribe) => unsubscribe());
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
          groupIds: () => deal.getState().groupIds,
          groups: () => deal.getState().groupIds.map((id) => {
            const group = deal.getState().groups[id];
            return {
              id, type: group.groupType, title: () => deal.getState().groups[id].ui.title,
              index: () => deal.getState().groups[id].ui.index,
              products: () => group.productIds.map((id) => ({
                id, type: deal.getState().products[id].data.productType,
                data: () => deal.getState().products[id].data,
                value: (field) => readProductField(deal.getState().products[id].data, field),
                issues: (field) => deal.getState().products[id].validationErrors[field],
              })),
            };
          }),
          currency: (field) => deal.getState()[field],
          isInternal: () => deal.getState().isInternal,
          stream: deal.getState().spotPriceStream,
          subscribe: (listener) => deal.subscribe(listener),
        };
      },
    };
  },
};

const products = (deal: DealProbe) => deal.groups().flatMap((group) => group.products());
const setProduct = (deal: DealProbe, group: GroupProbe, product: ProductProbe, field: ProductFieldId, value: FieldValue) =>
  deal.actions.setField({ scope: "product", groupId: group.id, productId: product.id, field }, value);
const broadcastValues = {
  strike: "12", callPut: "Call", buySell: "Buy", ccyPair: "EURUSD", deliveryDate: "2100-02-02",
  expiryCut: "NY", expiryDate: "2100-02-01", premiumDate: "2100-01-01", notionalAmount: 100,
  settlementStyle: "Cash", settlementCcy: "USD", settlementFixingSource: "Reuters",
} satisfies Record<(typeof broadcastFieldIds)[number], FieldValue>;

for (const [name, factory] of Object.entries(factories)) {
  test(`${name}: deals and initial groups survive tab switches without duplication`, () => {
    const workspace = factory();
    const firstId = workspace.activeDealId();
    const first = workspace.deal(firstId);
    assert.equal(first.groups().length, 1);
    first.actions.setField({ scope: "deal", field: "notionalCcy" }, "USD");
    const secondId = workspace.actions.addDeal();
    assert.equal(workspace.activeDealId(), secondId);
    assert.equal(workspace.deal(secondId).currency("notionalCcy"), "1xxxxxx");
    workspace.actions.setActiveDeal(firstId);
    assert.equal(first.currency("notionalCcy"), "USD");
    assert.equal(first.groups().length, 1);
    workspace.actions.setActiveDeal("missing");
    assert.equal(workspace.activeDealId(), firstId);
  });

  test(`${name}: group types create the upstream product types and nested shapes`, () => {
    const workspace = factory();
    const deal = workspace.deal(workspace.activeDealId());
    deal.actions.addGroup("Strategy");
    deal.actions.addGroup("Average");
    assert.deepEqual(deal.groups().map((group) => group.products().length), [1, 2, 1]);
    assert.deepEqual(products(deal).map((product) => product.type),
      ["VanillaProduct", "VanillaProduct", "VanillaProduct", "AverageProduct"]);
    assert.deepEqual(products(deal)[0].data(), createVanillaData(initialCurrencies));
    assert.deepEqual(products(deal)[3].data(), createAverageData(initialCurrencies));
    deal.groups().forEach((group, index) => assert.equal(group.index(), index));
  });

  test(`${name}: two-way currency edits reach every product across group types`, () => {
    const workspace = factory();
    const deal = workspace.deal(workspace.activeDealId());
    deal.actions.addGroup("Strategy");
    const averageId = deal.actions.addGroup("Average");
    const group = deal.groups().find((group) => group.id === averageId)!;
    for (const field of ["notionalCcy", "premiumCcy"] as const) {
      deal.actions.setField({ scope: "deal", field }, "EUR");
      assert.ok(products(deal).every((product) => product.value(field) === "EUR"));
      setProduct(deal, group, group.products()[0], field, "GBP");
      assert.equal(deal.currency(field), "GBP");
      assert.ok(products(deal).every((product) => product.value(field) === "GBP"));
    }
    const newId = deal.actions.addGroup("VanillaGroup");
    assert.equal(deal.groups().find((group) => group.id === newId)!.products()[0].value("premiumCcy"), "GBP");
  });

  test(`${name}: every deal broadcast reaches every group and is not retained`, () => {
    const workspace = factory();
    const deal = workspace.deal(workspace.activeDealId());
    deal.actions.addGroup("Strategy");
    deal.actions.addGroup("Average");
    for (const field of broadcastFieldIds) {
      deal.actions.broadcast(field, broadcastValues[field]);
      assert.ok(products(deal).every((product) => Object.is(product.value(field), broadcastValues[field])), field);
    }
    const newId = deal.actions.addGroup("Average");
    const fresh = deal.groups().find((group) => group.id === newId)!.products()[0];
    assert.equal(fresh.value("strike"), "");
    assert.equal(fresh.value("expiryDate"), "");
    assert.ok(Number.isNaN(fresh.value("notionalAmount")));
  });

  test(`${name}: product edits are local and the same broadcast can be repeated`, () => {
    const workspace = factory();
    const deal = workspace.deal(workspace.activeDealId());
    deal.actions.addGroup("Strategy");
    const first = deal.groups()[0];
    setProduct(deal, first, first.products()[0], "strike", "12");
    assert.deepEqual(products(deal).map((product) => product.value("strike")), ["12", "", ""]);
    deal.actions.broadcast("strike", "34");
    setProduct(deal, first, first.products()[0], "strike", "56");
    deal.actions.broadcast("strike", "34");
    assert.ok(products(deal).every((product) => product.value("strike") === "34"));
  });

  test(`${name}: group clones are adjacent deep copies with fresh ids and isolated local edits`, () => {
    const workspace = factory();
    const deal = workspace.deal(workspace.activeDealId());
    const sourceId = deal.actions.addGroup("Strategy");
    const source = deal.groups().find((group) => group.id === sourceId)!;
    setProduct(deal, source, source.products()[0], "strike", "77");
    setProduct(deal, source, source.products()[1], "expiryDate", "2100-02-01");
    const cloneId = deal.actions.cloneGroup(sourceId)!;
    assert.equal(deal.groupIds()[deal.groupIds().indexOf(sourceId) + 1], cloneId);
    const clone = deal.groups().find((group) => group.id === cloneId)!;
    assert.deepEqual(clone.products().map((product) => product.data()), source.products().map((product) => product.data()));
    assert.ok(clone.products().every((product) => !source.products().some((original) => original.id === product.id)));
    assert.ok(Number.isNaN(clone.products()[0].value("notionalAmount")));
    setProduct(deal, clone, clone.products()[0], "strike", "88");
    assert.equal(source.products()[0].value("strike"), "77");
    assert.equal(clone.title(), "Strategy #3");
    deal.groups().forEach((group, index) => assert.equal(group.index(), index));
  });

  test(`${name}: removing groups drops products/errors, reindexes, and permits an empty deal`, () => {
    const workspace = factory();
    const deal = workspace.deal(workspace.activeDealId());
    deal.actions.setField({ scope: "deal", field: "notionalCcy" }, "USD");
    const invalidId = deal.actions.addGroup("Average");
    const invalid = deal.groups().find((group) => group.id === invalidId)!;
    const removedProductId = invalid.products()[0].id;
    setProduct(deal, invalid, invalid.products()[0], "strike", "1234");
    assert.ok(products(deal).some((product) => product.issues("strike").length));
    const lastId = deal.actions.addGroup("Strategy");
    deal.actions.removeGroup(invalidId);
    assert.ok(!products(deal).some((product) => product.id === removedProductId));
    assert.ok(products(deal).every((product) => productFieldIds.every((field) => product.issues(field).length === 0)));
    assert.equal(deal.groups().find((group) => group.id === lastId)!.title(), "Strategy #2");
    for (const id of [...deal.groupIds()]) deal.actions.removeGroup(id);
    deal.actions.broadcast("strike", "12");
    assert.equal(deal.groups().length, 0);
    assert.equal(deal.actions.cloneGroup("missing"), undefined);
    deal.actions.removeGroup("missing");
    assert.equal(deal.groups().length, 0);
  });

  test(`${name}: expiry days and cross-field errors follow committed expiry dates`, () => {
    const workspace = factory();
    const deal = workspace.deal(workspace.activeDealId());
    deal.actions.addGroup("Average");
    deal.actions.broadcast("expiryDate", "2100-02-02");
    assert.ok(products(deal).every((product) => product.value("expiryDays") === daysUntil("2100-02-02")));
    deal.actions.broadcast("deliveryDate", "2100-02-01");
    assert.ok(products(deal).every((product) => product.issues("deliveryDate").some((issue) =>
      issue.message === "Delivery date can't be before expiry date")));
    deal.actions.broadcast("expiryDate", "2100-01-01");
    assert.ok(products(deal).every((product) => product.issues("deliveryDate").length === 0));
    const group = deal.groups()[0];
    const product = group.products()[0];
    setProduct(deal, group, product, "expiryDays", 999);
    assert.equal(product.value("expiryDays"), daysUntil("2100-01-01"));
    setProduct(deal, group, product, "expiryDate", "2000-01-01");
    assert.equal(product.issues("expiryDays")[0].message, "Expiry date is in the past");
    setProduct(deal, group, product, "expiryDate", "");
    assert.ok(Number.isNaN(product.value("expiryDays")));
    assert.equal(product.issues("expiryDays").length, 0);
  });

  test(`${name}: field schemas and nested updates agree with upstream product rules`, () => {
    const workspace = factory();
    const deal = workspace.deal(workspace.activeDealId());
    deal.actions.addGroup("Average");
    const fixtures: [ProductFieldId, FieldValue][] = [
      ["notionalCcy", "USD"], ["notionalAmount", 0], ["notionalAmount", NaN], ["notionalAmount", 12],
      ["premiumCcy", "1234567"], ["premiumCcy", "USD"], ["callPut", "invalid"], ["callPut", "Call"],
      ["buySell", "Sell"], ["ccyPair", "abc"], ["ccyPair", "EURUSD"], ["strike", "1234"],
      ["strike", "123"], ["expiryCut", "12345678901"], ["expiryCut", "NY"],
      ["expiryDate", "2100-02-02"], ["deliveryDate", "2100-02-01"], ["expiryDate", "2100-01-01"],
      ["premiumDate", "invalid"], ["premiumDate", ""], ["settlementStyle", "wrong"],
      ["settlementStyle", "Cash"], ["settlementCcy", "1234567"], ["settlementCcy", "USD"],
      ["settlementFixingSource", "x".repeat(21)], ["settlementFixingSource", "Reuters"],
    ];
    let vanilla = createVanillaData(initialCurrencies);
    let average = createAverageData(initialCurrencies);
    for (const [field, value] of fixtures) {
      vanilla = setVanillaField(vanilla, field, value);
      average = setAverageField(average, field, value);
      for (const group of deal.groups()) setProduct(deal, group, group.products()[0], field, value);
      assert.deepEqual(products(deal)[0].data(), vanilla, `${field}: vanilla data`);
      assert.deepEqual(products(deal)[1].data(), average, `${field}: average data`);
      const expected = [validateVanilla(vanilla), validateAverage(average)];
      products(deal).forEach((product, index) => productFieldIds.forEach((field) =>
        assert.deepEqual(product.issues(field).map((issue) => issue.message),
          (expected[index][field] ?? []).map((issue) => issue.message), `${product.type}.${field}`)));
    }
  });

  test(`${name}: unrelated fields retain identities and internal metadata stays independent`, () => {
    const workspace = factory();
    const deal = workspace.deal(workspace.activeDealId());
    const group = deal.groups()[0];
    const product = group.products()[0];
    const beforeIds = deal.groupIds();
    const beforeIssues = product.issues("notionalCcy");
    setProduct(deal, group, product, "strike", "1234");
    assert.equal(deal.groupIds(), beforeIds);
    assert.equal(product.issues("notionalCcy"), beforeIssues);
    deal.actions.setInternal(false);
    assert.equal(deal.isInternal(), false);
    assert.equal(product.value("premiumCcy"), "2");
  });

  test(`${name}: spot ticks bypass state and all timers stop on toggle/disconnect`, async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    const workspace = factory();
    if (!workspace.streamEnabled()) workspace.actions.toggleSpotPriceStream();
    const first = workspace.deal(workspace.activeDealId());
    let notifications = 0;
    const unsubscribe = first.subscribe(() => { notifications += 1; });
    let disconnect = workspace.connectStreams();
    try {
      t.mock.timers.tick(500);
      assert.equal(first.stream.getValue(), 1);
      assert.equal(notifications, 0);
      const second = workspace.deal(workspace.actions.addDeal());
      await Promise.resolve();
      t.mock.timers.tick(500);
      assert.equal(second.stream.getValue(), 1);
      workspace.actions.toggleSpotPriceStream();
      t.mock.timers.tick(1000);
      assert.equal(first.stream.getValue(), 2);
      assert.equal(second.stream.getValue(), 1);
      workspace.actions.toggleSpotPriceStream();
      disconnect();
      t.mock.timers.tick(1000);
      assert.equal(first.stream.getValue(), 2);
      disconnect = workspace.connectStreams();
      t.mock.timers.tick(500);
      assert.equal(first.stream.getValue(), 3);
      assert.equal(second.stream.getValue(), 2);
      assert.equal(notifications, 0);
    } finally { disconnect(); unsubscribe(); }
  });
}
