import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeApi, sleep } from "../../stores/support/fakeApi.ts";
import { at, createBattleApp, createMemoryStorage, readField, writeField } from "./support.ts";

afterEach(() => {
  vi.doUnmock(at("src-shared/validation.ts"));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Graphite = { graphite: { next: unknown[] } };
const links = (unit: unknown) => (unit as Graphite).graphite.next.length;

const loadEffector = async (app: "nested" | "model") => {
  vi.resetModules();
  const effector = await import("effector");
  const deal =
    app === "nested"
      ? await import("../../../src-effector-nested/stores/dealStore.ts")
      : await import("../../../src-effector-model/stores/dealStore.ts");
  const options =
    app === "nested"
      ? await import("../../../src-effector-nested/stores/optionsStore.ts")
      : await import("../../../src-effector-model/stores/optionsStore.ts");
  const newDeal = (autocalc = false) =>
    deal.createDealStore({
      $isSpotPriceStreamEnabled: effector.createStore(false),
      $isAutocalcEnabled: effector.createStore(autocalc),
    });
  return { effector, newDeal, ...options };
};

/** The options module of the instance loaded last (no reset). */
const loadOptionsOf = async (app: "nested" | "model") =>
  app === "nested"
    ? await import("../../../src-effector-nested/stores/optionsStore.ts")
    : await import("../../../src-effector-model/stores/optionsStore.ts");

/** Product paths by display position, from either effector deal's `$groups`. */
type AnyGroup = { id: string; products: Record<string, { id: string }> | { id: string }[] };
const productIdsOf = (group: AnyGroup) =>
  Array.isArray(group.products) ? group.products.map((product) => product.id) : Object.keys(group.products);
const groupList = (groups: unknown): AnyGroup[] => (Array.isArray(groups) ? groups : Object.values(groups as object));
const strikePath = (groups: unknown, groupIndex: number, productIndex = 0) => {
  const group = groupList(groups)[groupIndex];
  return `groups.${group.id}.products.${productIdsOf(group)[productIndex]}.data.optionsCommon.strike`;
};

describe("re-validation: one write validates one product, however many there are", () => {
  it.each(["redux", "effector-nested", "effector-model"] as const)("%s", async (app) => {
    installFakeApi();
    const counter = { calls: 0 };
    vi.doMock(at("src-shared/validation.ts"), async (importOriginal) => {
      const original = await importOriginal<typeof import("@shared/validation.ts")>();
      return {
        ...original,
        productIssues: (...args: Parameters<typeof original.productIssues>) => {
          counter.calls += 1;
          return original.productIssues(...args);
        },
      };
    });
    const handle = await createBattleApp(app);
    const { deal, dispose } = handle.newDeal();
    for (let i = 0; i < 100; i += 1) deal.addGroup("VanillaGroup");
    // issues are computed lazily in redux (on read): read them all once
    for (let i = 0; i < 100; i += 1) deal.fieldIssues(deal.getGroups()[i].productIds[0], "strike");
    const changed: string[][] = [];
    const stop = deal.subscribe((change) => {
      if (change.kind === "products") changed.push([...change.ids]);
    });
    counter.calls = 0;
    writeField(deal, 50, "strike", "7");
    for (let i = 0; i < 100; i += 1) deal.fieldIssues(deal.getGroups()[i].productIds[0], "strike");
    expect(counter.calls).toBe(1);
    const edited = deal.getGroups()[50].productIds[0];
    expect([...new Set(changed.flat())]).toEqual([edited]);
    console.log(`${app}: "products" reports for one edit`, changed);
    // effector-nested reports the product twice: once for its data ($groups), once for its issues ($validation)
    expect(changed.flat()).toHaveLength(app === "effector-nested" ? 2 : 1);
    stop();
    dispose();
    handle.dispose();
  });
});

describe("one batch, how many store updates?", () => {
  it.each(["nested", "model"] as const)("effector-%s: a paste into 200 products (100 groups)", async (app) => {
    installFakeApi();
    const { newDeal } = await loadEffector(app);
    const deal = newDeal();
    for (let i = 0; i < 100; i += 1) deal.actions.addGroupAction("Strategy");
    const groups = deal.$groups.getState();
    const paste = (value: string) =>
      groupList(groups).flatMap((group) =>
        productIdsOf(group).map((productId) => ({ path: `groups.${group.id}.products.${productId}.data.optionsCommon.strike`, value })),
      );
    let groupsUpdates = 0;
    const stop = deal.$groups.updates.watch(() => (groupsUpdates += 1));
    const started = performance.now();
    for (let i = 0; i < 5; i += 1) deal.actions.writePathsAction(paste(String(i)));
    const ms = (performance.now() - started) / 5;
    stop();
    console.log(`effector-${app}: 200-cell paste`, { groupsUpdatesPerPaste: groupsUpdates / 5, msPerPaste: Number(ms.toFixed(1)) });
    expect(groupsUpdates / 5).toBe(app === "nested" ? 1 : 100);
    deal.dispose();
  });

  it.each(["nested", "model"] as const)("effector-%s: a paste over 3 groups", async (app) => {
    installFakeApi();
    const { newDeal } = await loadEffector(app);
    const deal = newDeal();
    for (let i = 0; i < 3; i += 1) deal.actions.addGroupAction("VanillaGroup");
    let groupsUpdates = 0;
    let validationUpdates = 0;
    const stops = [
      deal.$groups.updates.watch(() => (groupsUpdates += 1)),
      deal.$validation.updates.watch(() => (validationUpdates += 1)),
    ];
    const requestId = deal.$calc.getState().requestId;
    const groups = deal.$groups.getState();
    deal.actions.writePathsAction([0, 1, 2].map((i) => ({ path: strikePath(groups, i), value: String(i + 1) })));
    const seen = { groupsUpdates, validationUpdates, requestIds: deal.$calc.getState().requestId - requestId };
    console.log(`effector-${app}: a 3-group paste`, seen);
    if (app === "nested") expect(seen).toEqual({ groupsUpdates: 1, validationUpdates: 1, requestIds: 1 });
    else expect(seen.groupsUpdates).toBeGreaterThan(1); // each product's change reaches the collection on its own
    stops.forEach((stop) => stop());
    deal.dispose();
  });
});

describe("effector-model: a store per path", () => {
  const writesToOtherGroup = async (pathStores: number) => {
    installFakeApi();
    const { newDeal } = await loadEffector("model");
    const { inspect } = await import("effector/inspect");
    const deal = newDeal();
    for (let i = 0; i < 40; i += 1) deal.actions.addGroupAction("Strategy");
    const groups = deal.$groups.getState();
    const fields = ["strike", "callPut", "buySell", "ccyPair", "expiryCut"];
    let updates = 0;
    const watchers: (() => void)[] = [];
    for (let i = 0; i < pathStores; i += 1) {
      // distinct paths (a repeated path is the same cached store): 40 groups x 2 products x 5 fields
      const group = groups[i % 40];
      const productId = group.products[Math.floor(i / 40) % 2].id;
      const path = `groups.${group.id}.products.${productId}.data.optionsCommon.${fields[Math.floor(i / 80) % 5]}`;
      watchers.push(deal.pathStore(path).updates.watch(() => (updates += 1)));
    }
    const target = groups[groups.length - 1];
    const path = `groups.${target.id}.products.${target.products[0].id}.data.optionsCommon.premiumDate`;
    let messages = 0;
    const stop = inspect({ fn: () => (messages += 1) });
    const started = performance.now();
    for (let i = 0; i < 50; i += 1) deal.actions.writePathsAction([{ path, value: `2030-01-${String(10 + (i % 20))}` }]);
    const ms = performance.now() - started;
    stop();
    watchers.forEach((unwatch) => unwatch());
    deal.dispose();
    return { messagesPerWrite: messages / 50, msPerWrite: ms / 50, pathStoreUpdates: updates };
  };

  it("updates only when its own value changes, but every write anywhere recomputes every path store", async () => {
    const none = await writesToOtherGroup(0);
    const many = await writesToOtherGroup(200);
    console.log("writes to another group, 0 path stores:", none, "200 path stores:", many);
    expect(many.pathStoreUpdates).toBe(0); // the guarantee holds...
    expect(many.messagesPerWrite).toBeGreaterThanOrEqual(none.messagesPerWrite + 2 * 200); // ...but each lens combine (and its store) runs on every write
  });

  it("the path-store cache outlives removed groups (and their lens nodes stay linked to the collection)", async () => {
    installFakeApi();
    const { newDeal } = await loadEffector("model");
    const deal = newDeal();
    deal.actions.addGroupAction("VanillaGroup");
    const baseline = links(deal.groups.$items);
    let lastPath = "";
    for (let cycle = 0; cycle < 50; cycle += 1) {
      deal.actions.addGroupAction("VanillaGroup");
      const groups = deal.$groups.getState();
      lastPath = strikePath(groups, 1);
      deal.pathStore(lastPath);
      deal.actions.removeGroupAction(groups[1].id);
    }
    expect(deal.$groups.getState()).toHaveLength(1);
    const stale = deal.pathStore(lastPath);
    expect(deal.pathStore(lastPath)).toBe(stale); // still cached for a group that is gone
    expect(stale.getState()).toBeUndefined();
    console.log("links from the groups collection: before", baseline, "after 50 add/path/remove cycles", links(deal.groups.$items));
    expect(links(deal.groups.$items) - baseline).toBeGreaterThanOrEqual(50);
    deal.dispose();
  });
});

describe("leaks: add/remove cycles and dispose()", () => {
  it("effector-model: a removed group's units are cleared (no growth in the collection's api fan-out)", async () => {
    installFakeApi();
    const { newDeal } = await loadEffector("model");
    const deal = newDeal();
    deal.actions.addGroupAction("Strategy");
    const baseline = { write: links(deal.groups.api.writeProducts), reconcile: links(deal.groups.api.reconcileOptions) };
    for (let cycle = 0; cycle < 50; cycle += 1) {
      deal.actions.addGroupAction("Strategy");
      deal.actions.removeGroupAction(deal.$order.getState()[1]);
    }
    expect({ write: links(deal.groups.api.writeProducts), reconcile: links(deal.groups.api.reconcileOptions) }).toEqual(baseline);
    deal.actions.addGroupAction("Strategy");
    // ...but each live instance adds a never-firing sample to the api event (see the @effector/model test below)
    expect(links(deal.groups.api.writeProducts)).toBe(baseline.write + 1);
    deal.dispose();
  });

  it.each(["nested", "model"] as const)(
    "effector-%s: dispose() leaves the deal wired to the module-level options effect, still reconciling",
    async (app) => {
      const api = installFakeApi({ Cash: [{ id: 3, name: "Shared" }, { id: 4, name: "C4" }] });
      const { newDeal, loadOptionsEffect } = await loadEffector(app);
      const before = { done: links(loadOptionsEffect.done), inFlight: links(loadOptionsEffect.inFlight) };
      const disposed = newDeal();
      disposed.actions.addGroupAction("VanillaGroup");
      const groups = disposed.$groups.getState();
      const path = strikePath(groups, 0).replace("optionsCommon.strike", "settlementStyle");
      disposed.actions.writePathsAction([{ path, value: "Cash" }]);
      await sleep(40);
      const fixing = path.replace("settlementStyle", "cashSettlement.fixingSource");
      const readFixing = () => {
        const group = groupList(disposed.$groups.getState())[0] as unknown as {
          products: Record<string, { data: unknown }> | { data: unknown }[];
        };
        const product = Array.isArray(group.products) ? group.products[0] : Object.values(group.products)[0];
        return JSON.stringify(product.data);
      };
      const dataBefore = readFixing();
      disposed.dispose();
      const afterDispose = { done: links(loadOptionsEffect.done), inFlight: links(loadOptionsEffect.inFlight) };

      api.lists.Cash = [{ id: 4, name: "C4" }];
      const other = newDeal(); // loads the deal column's Cash options
      await sleep(40);
      console.log(`effector-${app}: links on loadOptionsEffect`, { before, afterDispose }, { fixingPath: fixing });
      expect(afterDispose.done).toBeGreaterThan(before.done); // nothing was unlinked
      expect(readFixing()).not.toBe(dataBefore); // the disposed deal still reconciled (3 -> 4)
      other.dispose();
    },
  );
});

describe("@effector/model 0.0.8: keyval api delivery", () => {
  it("each instance's own api sample compares item keys with the api field name (a shadowed variable)", async () => {
    vi.resetModules();
    const { createEvent, createStore } = await import("effector");
    const { keyval } = await import("@effector/model");
    const delivered: string[] = [];
    const items = keyval(() => {
      const $id = createStore("");
      const ping = createEvent<string>();
      ping.watch((data) => delivered.push(`${$id.getState()} <- ${data}`));
      return { key: "id", state: { id: $id }, api: { ping } };
    });
    const baseline = links(items.api.ping);
    items.edit.add([{ id: "a" }, { id: "b" }, { id: "ping" }]);
    expect(links(items.api.ping) - baseline).toBe(3); // one sample per instance...
    items.api.ping({ key: "a", data: "for a" });
    expect(delivered).toEqual(["a <- for a"]); // ...that never fires for a normal key (delivery is $entities.on's launch)
    delivered.length = 0;
    items.api.ping({ key: "ping", data: "for ping" });
    // a key equal to the api field's name: every instance gets it, and the right one twice
    expect(delivered.sort()).toEqual(["a <- for ping", "b <- for ping", "ping <- for ping", "ping <- for ping"]);
  });
});

describe("scopes: fork and serialize", () => {
  it("effector-nested: every deal's units share one sid, so serialize keeps one deal's groups for all", async () => {
    installFakeApi();
    const { effector, newDeal } = await loadEffector("nested");
    const a = newDeal();
    const b = newDeal();
    expect(a.$groups.sid).toBeTruthy();
    expect(a.$groups.sid).toBe(b.$groups.sid);
    const scope = effector.fork();
    await effector.allSettled(a.actions.addGroupAction, { scope, params: "VanillaGroup" });
    await effector.allSettled(b.actions.addGroupAction, { scope, params: "Strategy" });
    expect([Object.keys(scope.getState(a.$groups)).length, Object.keys(scope.getState(b.$groups)).length]).toEqual([1, 1]);
    expect(a.$groups.getState()).toEqual({}); // the scope kept it apart from the global state: fork itself works
    const values = effector.serialize(scope);
    expect(Object.keys(values).filter((sid) => sid === a.$groups.sid)).toHaveLength(1); // one entry for two deals
    const restored = effector.fork({ values });
    const types = (groups: Record<string, { groupType: string }>) => Object.values(groups).map((group) => group.groupType);
    const seen = { a: types(restored.getState(a.$groups)), b: types(restored.getState(b.$groups)) };
    console.log("effector-nested: deals restored from serialize(scope)", seen);
    expect(seen.a.length + seen.b.length).toBe(1); // two deals with a group each went in; one group came back
    // the factory's own `loadAllOptionsEffect(dealOptionsRequests)` runs outside any scope
    await sleep(20);
    const { $optionsByKey } = await loadOptionsOf("nested");
    expect(Object.keys(scope.getState($optionsByKey))).toEqual([]);
    expect(Object.keys($optionsByKey.getState())).toEqual(["fixingSources:Cash"]);
    b.dispose();
  });

  it("effector-model: the collections have no sid, so serialize drops the groups but keeps $order", async () => {
    installFakeApi();
    const { effector, newDeal } = await loadEffector("model");
    const deal = newDeal();
    const scope = effector.fork();
    await effector.allSettled(deal.actions.addGroupAction, { scope, params: "VanillaGroup" });
    expect(scope.getState(deal.$groups)).toHaveLength(1);
    const restored = effector.fork({ values: effector.serialize(scope) });
    expect(restored.getState(deal.$order)).toHaveLength(1);
    expect(restored.getState(deal.$groups)).toHaveLength(0); // $order lists a group the collection doesn't have
    deal.dispose();
  });
});

describe("D3: the switches across browser tabs (effector-storage)", () => {
  it.each(["nested", "model"] as const)("effector-%s follows a storage event from another tab", async (app) => {
    const storage = createMemoryStorage();
    const events = new EventTarget();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("addEventListener", events.addEventListener.bind(events));
    vi.stubGlobal("removeEventListener", events.removeEventListener.bind(events));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    installFakeApi();
    vi.resetModules();
    const tabs =
      app === "nested"
        ? await import("../../../src-effector-nested/stores/multiTabStore.ts")
        : await import("../../../src-effector-model/stores/multiTabStore.ts");
    const fromOtherTab = (key: string, newValue: string) => {
      const event = Object.assign(new Event("storage"), { storageArea: storage, key, newValue });
      events.dispatchEvent(event);
    };
    const key = `effector-${app}-devtools:isAutocalcEnabled`;
    expect(tabs.$isAutocalcEnabled.getState()).toBe(true);
    fromOtherTab(key, "false");
    expect(tabs.$isAutocalcEnabled.getState()).toBe(false); // synced
    fromOtherTab(key, JSON.stringify("yes"));
    expect(tabs.$isAutocalcEnabled.getState()).toBe(false); // the contract rejects a non-boolean...
    expect(errors).toHaveBeenCalled(); // ...and effector-storage's default `fail` logs it
    tabs.toggleAutocalcEnabledAction();
    expect(storage.getItem(key)).toBe("true"); // and saves its own changes
  });
});

describe("devtools: @effector/redux-devtools-adapter", () => {
  it.each(["nested", "model"] as const)(
    "effector-%s: log only (a jump does nothing), and a burst of more than 99 logs loses its oldest",
    async (app) => {
      type Message = { type: string; payload?: { type: string }; state?: string };
      const sent: string[] = [];
      let monitor: ((message: Message) => void) | undefined;
      const connect = (sink: string[] | null) => () => ({
        init: () => {},
        send: (action: { type: string }) => sink?.push(action.type),
        subscribe: (listener: (message: Message) => void) => {
          if (sink === sent) monitor = listener;
          return () => {};
        },
      });
      vi.stubGlobal("__REDUX_DEVTOOLS_EXTENSION__", { connect: connect(sent) });
      vi.stubGlobal("window", globalThis);
      vi.stubGlobal("location", { search: "" });
      installFakeApi();
      vi.resetModules();
      // the app's own wiring (name, trace, stateTab, replacer; batching left at its default)
      if (app === "nested") await import("../../../src-effector-nested/devtools.ts");
      else await import("../../../src-effector-model/devtools.ts");
      const tabs =
        app === "nested"
          ? await import("../../../src-effector-nested/stores/multiTabStore.ts")
          : await import("../../../src-effector-model/stores/multiTabStore.ts");
      // the same graph, reported unbatched: everything the app's adapter was given
      const everything: string[] = [];
      const { attachReduxDevTools } = await import("@effector/redux-devtools-adapter");
      vi.stubGlobal("__REDUX_DEVTOOLS_EXTENSION__", { connect: connect(everything) });
      const detach = attachReduxDevTools({ name: "unbatched", trace: true, stateTab: true, batch: false });

      tabs.addNewDealAction();
      await sleep(10);
      const deal = Object.values(tabs.$deals.getState())[0];
      for (let i = 0; i < 10; i += 1) deal.actions.addGroupAction("Strategy");
      const groups = deal.$groups.getState();
      const sentBeforePaste = everything.length;
      // one paste: a strike into each of the 20 products
      deal.actions.writePathsAction(
        groupList(groups).flatMap((group) =>
          productIdsOf(group).map((productId) => ({
            path: `groups.${group.id}.products.${productId}.data.optionsCommon.strike`,
            value: "1",
          })),
        ),
      );
      const pasteLogs = everything.length - sentBeforePaste;
      await sleep(700); // the adapter's 500 ms debounce
      const groupsBeforeJump = deal.$groups.getState();
      monitor?.({ type: "DISPATCH", payload: { type: "JUMP_TO_STATE" }, state: "{}" });
      expect(deal.$groups.getState()).toBe(groupsBeforeJump); // no time travel
      console.log(`effector-${app}: logs for one 20-cell paste`, pasteLogs, "| total generated", everything.length, "| delivered by the app's adapter", sent.length);
      if (pasteLogs > 99) expect(sent.length).toBeLessThan(everything.length); // the burst overflowed the queue
      detach();
    },
  );
});

describe("effector: a disposed or test-only deal is cheap to create? (graph size per deal)", () => {
  it.each(["nested", "model"] as const)("effector-%s: nodes created per deal and per group", async (app) => {
    installFakeApi();
    vi.resetModules();
    const { inspectGraph } = await import("effector/inspect");
    let declared = 0;
    const stop = inspectGraph({ fn: () => (declared += 1) });
    const { newDeal } = await loadEffector(app);
    const baseline = declared;
    const deal = newDeal();
    const perDeal = declared - baseline;
    const beforeGroups = declared;
    for (let i = 0; i < 10; i += 1) deal.actions.addGroupAction("Strategy");
    const perGroup = (declared - beforeGroups) / 10;
    stop();
    console.log(`effector-${app}: units declared per deal`, perDeal, "per Strategy group", perGroup);
    if (app === "nested") expect(perGroup).toBe(0);
    else expect(perGroup).toBeGreaterThan(0);
    deal.dispose();
  });
});

void readField;
