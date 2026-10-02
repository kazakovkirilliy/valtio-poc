import { createStore } from "zustand/vanilla";
import {
  createProductValues, initialCurrencies, parseFieldPath, productCurrencyField,
  sameIssues, validate, readStreamPreference, writeStreamPreference,
  type CurrencyField, type DealValues, type ProductField, type ProductValues,
  type WorkspaceActions,
} from "../domain.ts";
import { connectSpotPriceStreams, createSpotPriceStream } from "../spotPriceStream.ts";

function updateProduct(product: ProductValues, field: ProductField, value: string): ProductValues {
  if (product[field] === value) return product;
  const nextIssues = validate(field, value);
  const previousIssues = product.validationErrors[field];
  return {
    ...product,
    [field]: value,
    validationErrors: sameIssues(previousIssues, nextIssues) ? product.validationErrors :
      { ...product.validationErrors, [field]: nextIssues },
  };
}

export function createZustandDeal() {
  const firstProductId = crypto.randomUUID();
  return createStore<DealValues>()((set, get) => {
    const setCurrency = (field: CurrencyField, value: string) => {
      // Zustand: one immutable update publishes the deal and all products together.
      set((state) => {
        if (state[field] === value) return state;
        const productField = productCurrencyField(field);
        return {
          [field]: value,
          products: Object.fromEntries(Object.entries(state.products).map(([id, product]) =>
            [id, updateProduct(product, productField, value)])),
        };
      });
    };
    return {
      ...initialCurrencies,
      isInternal: true,
      productIds: [firstProductId],
      products: {
        [firstProductId]: createProductValues(initialCurrencies.notionalCcy, initialCurrencies.premiumCcy),
      },
      spotPriceStream: createSpotPriceStream(),
      actions: {
        addProduct() {
          const id = crypto.randomUUID();
          set((state) => ({
            productIds: [...state.productIds, id],
            products: {
              ...state.products,
              [id]: createProductValues(state.notionalCcy, state.premiumCcy),
            },
          }));
          return id;
        },
        setField(path, value) {
          const target = parseFieldPath(path);
          if (target.scope === "deal") {
            setCurrency(target.field, value);
          } else if (target.field === "strike") {
            set((state) => {
              const product = state.products[target.productId];
              const updated = updateProduct(product, target.field, value);
              return updated === product ? state : {
                products: { ...state.products, [target.productId]: updated },
              };
            });
          } else {
            setCurrency(target.field === "productNotionalCcy" ? "notionalCcy" : "premiumCcy", value);
          }
        },
        broadcastStrike(value) {
          set((state) => ({
            products: Object.fromEntries(Object.entries(state.products).map(([id, product]) =>
              [id, updateProduct(product, "strike", value)])),
          }));
        },
        setInternal(value) {
          if (get().isInternal !== value) set({ isInternal: value });
        },
      },
    };
  });
}

export type ZustandDeal = ReturnType<typeof createZustandDeal>;

export function createZustandWorkspace() {
  const firstDealId = crypto.randomUUID();
  const workspace = createStore<{
    dealIds: string[];
    activeDealId: string;
    deals: Record<string, ZustandDeal>;
    streamEnabled: boolean;
    actions: WorkspaceActions;
  }>()((set, get) => ({
    dealIds: [firstDealId],
    activeDealId: firstDealId,
    deals: { [firstDealId]: createZustandDeal() },
    streamEnabled: readStreamPreference("zustand"),
    actions: {
      addDeal() {
        const id = crypto.randomUUID();
        set((state) => ({
          deals: { ...state.deals, [id]: createZustandDeal() },
          dealIds: [...state.dealIds, id],
          activeDealId: id,
        }));
        return id;
      },
      setActiveDeal(id) {
        if (get().deals[id]) set({ activeDealId: id });
      },
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
