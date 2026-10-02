import { createStore } from "zustand/vanilla";
import {
  copyProductData, createProductData, groupDefinitions, initialCurrencies, isSyncedField,
  productDefinitions, productFieldPath, readProductField, readStreamPreference, sameIssues,
  setIn, validateField, validateProduct, writeStreamPreference,
  type DealActions, type FieldValue, type GroupType, type Issues, type ProductData,
  type WorkspaceActions,
} from "../../src-shared/domain.ts";
import type { ProductFieldId } from "../../src-shared/fields.ts";
import { daysUntil } from "../../src-shared/date.ts";
import { connectSpotPriceStreams, createSpotPriceStream } from "../../src-shared/spotPriceStream.ts";
import type { SpotPriceStream } from "../../src-shared/spotPriceStream.ts";

type ProductState = {
  id: string;
  ui: { title: string; index: number };
  data: ProductData;
  validationErrors: Record<ProductFieldId, Issues>;
};
type GroupState = {
  id: string;
  groupType: GroupType;
  ui: { title: string; index: number };
  productIds: string[];
};
export type DealState = {
  notionalCcy: string;
  premiumCcy: string;
  isInternal: boolean;
  groups: Record<string, GroupState>;
  groupIds: string[];
  products: Record<string, ProductState>;
  spotPriceStream: SpotPriceStream;
  actions: DealActions;
};

function updateProduct(product: ProductState, field: ProductFieldId, value: FieldValue): ProductState {
  if (field === "expiryDays") return product; // derived, never writable
  let data = setIn(product.data, productFieldPath(product.data.productType, field), value);
  if (field === "expiryDate") {
    data = setIn(data, productFieldPath(data.productType, "expiryDays"), daysUntil(String(value)));
  }
  if (data === product.data) return product;
  let validationErrors = product.validationErrors;
  const affected: ProductFieldId[] = field === "expiryDate" ?
    ["expiryDate", "expiryDays", "deliveryDate"] : [field];
  for (const id of affected) {
    const issues = validateField(id, readProductField(data, id), String(readProductField(data, "expiryDate")));
    if (!sameIssues(validationErrors[id], issues)) {
      validationErrors = { ...validationErrors, [id]: issues };
    }
  }
  return { ...product, data, validationErrors };
}

function reindexGroups(groups: DealState["groups"], order: string[]) {
  const result = { ...groups };
  order.forEach((id, index) => {
    const group = groups[id];
    const title = `${groupDefinitions[group.groupType].label} #${index + 1}`;
    if (group.ui.index !== index || group.ui.title !== title) result[id] = { ...group, ui: { index, title } };
  });
  return result;
}

function createZustandDeal() {
  const deal = createStore<DealState>()((set, get) => {
    const insertGroup = (type: GroupType, position: number, source?: GroupState) => {
      const id = crypto.randomUUID();
      set((state) => {
        const products = groupDefinitions[type].productTypes.map((productType, index): ProductState => {
          const productId = crypto.randomUUID();
          const sourceProduct = source && state.products[source.productIds[index]];
          const data = sourceProduct ? copyProductData(sourceProduct.data) : createProductData(productType, state);
          return {
            id: productId, data,
            ui: { index, title: `${productDefinitions[productType].label} #${index + 1}` },
            validationErrors: validateProduct(data),
          };
        });
        const group: GroupState = {
          id, groupType: type, ui: { title: "", index: position },
          productIds: products.map((product) => product.id),
        };
        const groupIds = state.groupIds.toSpliced(position, 0, id);
        return {
          groupIds, groups: reindexGroups({ ...state.groups, [id]: group }, groupIds),
          products: { ...state.products, ...Object.fromEntries(products.map((product) => [product.id, product])) },
        };
      });
      return id;
    };
    const setCurrency = (field: "notionalCcy" | "premiumCcy", value: FieldValue) => {
      set((state) => {
        if (state[field] === value) return state;
        return {
          [field]: String(value),
          products: Object.fromEntries(Object.entries(state.products).map(([id, product]) =>
            [id, updateProduct(product, field, String(value))])),
        };
      });
    };
    return {
      ...initialCurrencies, isInternal: true, groupIds: [], groups: {}, products: {},
      spotPriceStream: createSpotPriceStream(),
      actions: {
        addGroup: (type) => insertGroup(type, get().groupIds.length),
        cloneGroup(id) {
          const group = get().groups[id];
          return group ? insertGroup(group.groupType, get().groupIds.indexOf(id) + 1, group) : undefined;
        },
        removeGroup(id) {
          set((state) => {
            const group = state.groups[id];
            if (!group) return state;
            const groupIds = state.groupIds.filter((groupId) => groupId !== id);
            const groups = { ...state.groups };
            const products = { ...state.products };
            delete groups[id];
            group.productIds.forEach((productId) => { delete products[productId]; });
            return { groupIds, groups: reindexGroups(groups, groupIds), products };
          });
        },
        setField(target, value) {
          if (target.scope === "deal") { setCurrency(target.field, value); return; }
          if (!get().groups[target.groupId]?.productIds.includes(target.productId)) return;
          if (isSyncedField(target.field)) { setCurrency(target.field, value); return; }
          set((state) => {
            const product = state.products[target.productId];
            const next = updateProduct(product, target.field, value);
            return next === product ? state : { products: { ...state.products, [product.id]: next } };
          });
        },
        broadcast(field, value) {
          set((state) => ({ products: Object.fromEntries(Object.entries(state.products).map(([id, product]) =>
            [id, updateProduct(product, field, value)])) }));
        },
        setInternal(value) { if (get().isInternal !== value) set({ isInternal: value }); },
      },
    };
  });
  deal.getState().actions.addGroup("VanillaGroup");
  return deal;
}
export type ZustandDeal = ReturnType<typeof createZustandDeal>;

export function createZustandWorkspace() {
  const firstId = crypto.randomUUID();
  const workspace = createStore<{
    dealIds: string[]; activeDealId: string; deals: Record<string, ZustandDeal>;
    streamEnabled: boolean; actions: WorkspaceActions;
  }>()((set, get) => ({
    dealIds: [firstId], activeDealId: firstId, deals: { [firstId]: createZustandDeal() },
    streamEnabled: readStreamPreference("zustand"),
    actions: {
      addDeal() {
        const id = crypto.randomUUID();
        set((state) => ({
          dealIds: [...state.dealIds, id], activeDealId: id,
          deals: { ...state.deals, [id]: createZustandDeal() },
        }));
        return id;
      },
      setActiveDeal(id) { if (get().deals[id]) set({ activeDealId: id }); },
      toggleSpotPriceStream() {
        const enabled = !get().streamEnabled;
        set({ streamEnabled: enabled });
        writeStreamPreference("zustand", enabled);
      },
    },
  }));
  const connectStreams = () => connectSpotPriceStreams(
    () => Object.values(workspace.getState().deals).map((deal) => deal.getState().spotPriceStream),
    () => workspace.getState().streamEnabled,
    (listener) => workspace.subscribe(listener),
  );
  return { workspace, connectStreams };
}
