import { atom, createStore, type Atom, type PrimitiveAtom } from "jotai/vanilla";
import {
  copyProductData, createProductData, groupDefinitions, hedgeTypesFor,
  initialCurrencies, isSyncedField, productDefinitions, productFieldIds, productFieldPath,
  readProductField, readStreamPreference, setIn, validateField, writeStreamPreference,
  type DealActions, type FieldValue, type GroupType, type Issues, type ProductData,
  type ProductSummary, type ProductType, type WorkspaceActions,
} from "../../src-shared/domain.ts";
import type { ProductFieldId } from "../../src-shared/fields.ts";
import { daysUntil } from "../../src-shared/date.ts";
import { connectSpotPriceStreams, createSpotPriceStream } from "../../src-shared/spotPriceStream.ts";

type Getter = Parameters<Atom<unknown>["read"]>[0];
type ProductAtoms = {
  summary: ProductSummary;
  fields: Record<ProductFieldId, Atom<FieldValue>>;
  writableFields: Partial<Record<ProductFieldId, PrimitiveAtom<FieldValue>>>;
  issues: Record<ProductFieldId, Atom<Issues>>;
  data: Atom<ProductData>;
};
type GroupAtoms = {
  id: string;
  groupType: GroupType;
  ui: PrimitiveAtom<{ title: string; index: number }>;
  products: Record<string, ProductAtoms>;
  productIds: string[];
};

function createJotaiDeal() {
  const notionalCcy = atom<FieldValue>(initialCurrencies.notionalCcy);
  const premiumCcy = atom<FieldValue>(initialCurrencies.premiumCcy);
  const isInternal = atom(true);
  const groups = atom<Record<string, GroupAtoms>>({});
  const groupIds = atom<string[]>([]);

  const createProduct = (type: ProductType, index: number, get: Getter, source?: ProductAtoms): ProductAtoms => {
    const id = crypto.randomUUID();
    const currencies = { notionalCcy: String(get(notionalCcy)), premiumCcy: String(get(premiumCcy)) };
    const initial = source ? copyProductData(get(source.data)) : createProductData(type, currencies);
    const writableFields: ProductAtoms["writableFields"] = {};
    const fieldAtoms = {} as ProductAtoms["fields"];
    for (const field of productFieldIds) {
      if (field === "expiryDays") continue;
      // Every product shares the deal's currency atoms, avoiding mirrored state.
      const fieldAtom = field === "notionalCcy" ? notionalCcy : field === "premiumCcy" ?
        premiumCcy : atom<FieldValue>(readProductField(initial, field));
      if (!isSyncedField(field)) fieldAtom.debugLabel = `${type}.${id}.${field}`;
      writableFields[field] = fieldAtom;
      fieldAtoms[field] = fieldAtom;
    }
    fieldAtoms.expiryDays = atom((get) => daysUntil(String(get(fieldAtoms.expiryDate))));
    const issues = Object.fromEntries(productFieldIds.map((field) => [field,
      atom((get) => validateField(field, get(fieldAtoms[field]),
        field === "deliveryDate" ? String(get(fieldAtoms.expiryDate)) : "")),
    ])) as ProductAtoms["issues"];
    // A nested snapshot is derived only when requested (for cloning/inspection).
    const data = atom((get) => {
      let result = createProductData(type, {
        notionalCcy: String(get(notionalCcy)), premiumCcy: String(get(premiumCcy)),
      });
      for (const field of productFieldIds) {
        result = setIn(result, productFieldPath(type, field), get(fieldAtoms[field]));
      }
      return result;
    });
    return {
      summary: { id, title: `${productDefinitions[type].label} #${index + 1}`, productType: type },
      fields: fieldAtoms, writableFields, issues, data,
    };
  };

  const insertGroup = atom(null, (get, set, type: GroupType, position: number, source?: GroupAtoms) => {
    const id = crypto.randomUUID();
    const products = groupDefinitions[type].productTypes.map((productType, index) =>
      createProduct(productType, index, get, source?.products[source.productIds[index]]));
    const group: GroupAtoms = {
      id, groupType: type, ui: atom({ title: "", index: position }),
      products: Object.fromEntries(products.map((product) => [product.summary.id, product])),
      productIds: products.map((product) => product.summary.id),
    };
    const nextGroups = { ...get(groups), [id]: group };
    const nextIds = get(groupIds).toSpliced(position, 0, id);
    set(groups, nextGroups);
    set(groupIds, nextIds);
    nextIds.forEach((groupId, index) => {
      const current = nextGroups[groupId];
      const title = `${groupDefinitions[current.groupType].label} #${index + 1}`;
      const previous = get(current.ui);
      if (previous.index !== index || previous.title !== title) set(current.ui, { index, title });
    });
    return id;
  });

  const removeGroup = atom(null, (get, set, id: string) => {
    if (!get(groups)[id]) return;
    const nextGroups = { ...get(groups) };
    delete nextGroups[id];
    const nextIds = get(groupIds).filter((groupId) => groupId !== id);
    set(groups, nextGroups);
    set(groupIds, nextIds);
    nextIds.forEach((groupId, index) => {
      const group = nextGroups[groupId];
      const title = `${groupDefinitions[group.groupType].label} #${index + 1}`;
      const previous = get(group.ui);
      if (previous.index !== index || previous.title !== title) set(group.ui, { index, title });
    });
    // Removed atoms leave the graph; aggregate validation only reads remaining groups.
  });

  const broadcast = atom(null, (get, set, field: ProductFieldId, value: FieldValue) => {
    for (const group of Object.values(get(groups))) {
      for (const product of Object.values(group.products)) {
        const target = product.writableFields[field];
        if (target) set(target, value);
      }
    }
  });
  const hedgeTypes = atom((get) => hedgeTypesFor(get(isInternal)));
  const hasValidationErrors = atom((get) => Object.values(get(groups)).some((group) =>
    Object.values(group.products).some((product) =>
      productFieldIds.some((field) => get(product.issues[field]).length > 0))));

  return {
    notionalCcy, premiumCcy, isInternal, groups, groupIds, insertGroup, removeGroup,
    broadcast, hedgeTypes, hasValidationErrors, spotPriceStream: createSpotPriceStream(),
  };
}
export type JotaiDeal = ReturnType<typeof createJotaiDeal>;

export function createJotaiWorkspace() {
  const store = createStore();
  const initializedDeal = () => {
    const deal = createJotaiDeal();
    store.set(deal.insertGroup, "VanillaGroup", 0);
    return deal;
  };
  const firstId = crypto.randomUUID();
  const deals = atom<Record<string, JotaiDeal>>({ [firstId]: initializedDeal() });
  const dealIds = atom<string[]>([firstId]);
  const activeDealId = atom<string>(firstId);
  const streamEnabled = atom(readStreamPreference("jotai"));
  const addDeal = atom(null, (get, set) => {
    const id = crypto.randomUUID();
    set(deals, { ...get(deals), [id]: initializedDeal() });
    set(dealIds, [...get(dealIds), id]);
    set(activeDealId, id);
    return id;
  });
  const actions: WorkspaceActions = {
    addDeal: () => store.set(addDeal),
    setActiveDeal(id) { if (store.get(deals)[id]) store.set(activeDealId, id); },
    toggleSpotPriceStream() {
      const enabled = !store.get(streamEnabled);
      store.set(streamEnabled, enabled);
      writeStreamPreference("jotai", enabled);
    },
  };
  const getDeal = (id: string) => store.get(deals)[id];
  const cachedActions = new Map<string, DealActions>();
  const getDealActions = (id: string): DealActions => {
    const existing = cachedActions.get(id);
    if (existing) return existing;
    const deal = getDeal(id);
    const actions: DealActions = {
      addGroup: (type) => store.set(deal.insertGroup, type, store.get(deal.groupIds).length),
      cloneGroup(groupId) {
        const group = store.get(deal.groups)[groupId];
        if (!group) return;
        return store.set(deal.insertGroup, group.groupType, store.get(deal.groupIds).indexOf(groupId) + 1, group);
      },
      removeGroup: (groupId) => store.set(deal.removeGroup, groupId),
      setField(target, value) {
        if (target.scope === "deal") { store.set(deal[target.field], value); return; }
        const product = store.get(deal.groups)[target.groupId]?.products[target.productId];
        const fieldAtom = product?.writableFields[target.field];
        if (fieldAtom) store.set(fieldAtom, value);
      },
      broadcast: (field, value) => store.set(deal.broadcast, field, value),
      setInternal: (value) => store.set(deal.isInternal, value),
    };
    cachedActions.set(id, actions);
    return actions;
  };
  const connectStreams = () => connectSpotPriceStreams(
    () => Object.values(store.get(deals)).map((deal) => deal.spotPriceStream),
    () => store.get(streamEnabled),
    (listener) => {
      const subscriptions = [store.sub(deals, listener), store.sub(streamEnabled, listener)];
      return () => subscriptions.forEach((unsubscribe) => unsubscribe());
    },
  );
  return { store, deals, dealIds, activeDealId, streamEnabled, actions, getDeal, getDealActions, connectStreams };
}
