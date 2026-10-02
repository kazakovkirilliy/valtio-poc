import { atom, createStore, type Atom, type PrimitiveAtom } from "jotai/vanilla";
import {
  hedgeTypesFor, initialCurrencies, noIssues, parseFieldPath, productFields, validate,
  readStreamPreference, writeStreamPreference, type DealActions, type Issues,
  type ProductField, type WorkspaceActions,
} from "../domain.ts";
import { connectSpotPriceStreams, createSpotPriceStream } from "../spotPriceStream.ts";

function fieldAtom(value: string, label: string) {
  const field = atom(value);
  field.debugLabel = label;
  return field;
}

type ProductAtoms = {
  fields: Record<ProductField, PrimitiveAtom<string>>;
  issues: Record<ProductField, Atom<Issues>>;
};

export function createJotaiDeal() {
  const notionalCcy = fieldAtom(initialCurrencies.notionalCcy, "deal.notionalCcy");
  const premiumCcy = fieldAtom(initialCurrencies.premiumCcy, "deal.premiumCcy");
  const isInternal = atom(true);

  const createProduct = (id: string): ProductAtoms => {
    const fields = {
      // Both inputs address the SAME currency atom: two-way sync needs no effects.
      productNotionalCcy: notionalCcy,
      productPremiumCcy: premiumCcy,
      strike: fieldAtom("", `product.${id}.strike`),
    };
    return {
      fields,
      issues: {
        productNotionalCcy: atom((get) => validate("productNotionalCcy", get(notionalCcy))),
        productPremiumCcy: atom((get) => validate("productPremiumCcy", get(premiumCcy))),
        strike: atom((get) => validate("strike", get(fields.strike))),
      },
    };
  };

  const firstProductId = crypto.randomUUID();
  const products = atom<Record<string, ProductAtoms>>({
    [firstProductId]: createProduct(firstProductId),
  });
  const productIds = atom<string[]>([firstProductId]);
  const hedgeTypes = atom((get) => hedgeTypesFor(get(isInternal)));
  const hasValidationErrors = atom((get) =>
    Object.values(get(products)).some((product) =>
      productFields.some((field) => get(product.issues[field]).length > 0)),
  );

  const addProduct = atom(null, (get, set) => {
    const id = crypto.randomUUID();
    set(products, { ...get(products), [id]: createProduct(id) });
    set(productIds, [...get(productIds), id]);
    return id;
  });
  const broadcastStrike = atom(null, (get, set, value: string) => {
    for (const product of Object.values(get(products))) {
      set(product.fields.strike, value);
    }
  });
  return {
    notionalCcy, premiumCcy, isInternal, products, productIds, hedgeTypes,
    hasValidationErrors, addProduct, broadcastStrike,
    spotPriceStream: createSpotPriceStream(),
  };
}

export type JotaiDeal = ReturnType<typeof createJotaiDeal>;

export function createJotaiWorkspace() {
  const store = createStore();
  const firstDealId = crypto.randomUUID();
  const deals = atom<Record<string, JotaiDeal>>({ [firstDealId]: createJotaiDeal() });
  const dealIds = atom<string[]>([firstDealId]);
  const activeDealId = atom<string>(firstDealId);
  const streamEnabled = atom(readStreamPreference("jotai"));

  const addDeal = atom(null, (get, set) => {
    const id = crypto.randomUUID();
    set(deals, { ...get(deals), [id]: createJotaiDeal() });
    set(dealIds, [...get(dealIds), id]);
    set(activeDealId, id);
    return id;
  });

  const actions: WorkspaceActions = {
    addDeal: () => store.set(addDeal),
    setActiveDeal(id) {
      if (store.get(deals)[id]) store.set(activeDealId, id);
    },
    toggleSpotPriceStream() {
      const enabled = !store.get(streamEnabled);
      store.set(streamEnabled, enabled);
      writeStreamPreference("jotai", enabled);
    },
  };

  const getDeal = (id: string) => store.get(deals)[id];
  const dealActions = new Map<string, DealActions>();
  const getDealActions = (id: string): DealActions => {
    const existing = dealActions.get(id);
    if (existing) return existing;
    const deal = getDeal(id);
    const value: DealActions = {
      addProduct: () => store.set(deal.addProduct),
      setField(path, nextValue) {
        const target = parseFieldPath(path);
        const field = target.scope === "deal" ? deal[target.field] :
          store.get(deal.products)[target.productId].fields[target.field];
        store.set(field, nextValue);
      },
      broadcastStrike: (nextValue) => store.set(deal.broadcastStrike, nextValue),
      setInternal: (nextValue) => store.set(deal.isInternal, nextValue),
    };
    dealActions.set(id, value);
    return value;
  };

  const connectStreams = () => connectSpotPriceStreams(
    () => Object.values(store.get(deals)).map((deal) => deal.spotPriceStream),
    () => store.get(streamEnabled),
    (listener) => {
      const unsubscribers = [store.sub(deals, listener), store.sub(streamEnabled, listener)];
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
  );
  // Deal currencies have no validation, matching the original product-only rules.
  const dealIssues = atom(noIssues);
  return {
    store, deals, dealIds, activeDealId, streamEnabled, dealIssues, actions,
    getDeal, getDealActions, connectStreams,
  };
}
