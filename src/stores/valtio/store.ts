import { proxy, ref, subscribe } from "valtio/vanilla";
import {
  createProductValues, initialCurrencies, parseFieldPath, productCurrencyField,
  sameIssues, validate, readStreamPreference, writeStreamPreference,
  type CurrencyField, type DealValues, type ProductField, type ProductValues,
  type WorkspaceActions,
} from "../domain.ts";
import { connectSpotPriceStreams, createSpotPriceStream } from "../spotPriceStream.ts";

export function createValtioDeal(): DealValues {
  const firstProductId = crypto.randomUUID();

  const updateProduct = (product: ProductValues, field: ProductField, value: string) => {
    product[field] = value;
    const issues = validate(field, value);
    if (!sameIssues(product.validationErrors[field], issues)) {
      product.validationErrors[field] = issues;
    }
  };

  const setCurrency = (field: CurrencyField, value: string) => {
    // Valtio: ordinary mutations on nested proxies; no copying or set() call.
    deal[field] = value;
    for (const product of Object.values(deal.products)) {
      updateProduct(product, productCurrencyField(field), value);
    }
  };

  const deal = proxy<DealValues>({
    ...initialCurrencies,
    isInternal: true,
    productIds: [firstProductId],
    products: {
      [firstProductId]: createProductValues(initialCurrencies.notionalCcy, initialCurrencies.premiumCcy),
    },
    spotPriceStream: ref(createSpotPriceStream()),
    actions: {
      addProduct() {
        const id = crypto.randomUUID();
        deal.products[id] = createProductValues(deal.notionalCcy, deal.premiumCcy);
        deal.productIds.push(id);
        return id;
      },
      setField(path, value) {
        const target = parseFieldPath(path);
        if (target.scope === "deal") {
          setCurrency(target.field, value);
        } else if (target.field === "strike") {
          updateProduct(deal.products[target.productId], target.field, value);
        } else {
          setCurrency(target.field === "productNotionalCcy" ? "notionalCcy" : "premiumCcy", value);
        }
      },
      broadcastStrike(value) {
        // A command, not a retained deal value. Repeating a value still broadcasts.
        for (const product of Object.values(deal.products)) {
          updateProduct(product, "strike", value);
        }
      },
      setInternal(value) {
        deal.isInternal = value;
      },
    },
  });
  return deal;
}

export function createValtioWorkspace() {
  const firstDealId = crypto.randomUUID();
  const workspace = proxy<{
    dealIds: string[];
    activeDealId: string;
    deals: Record<string, DealValues>;
    streamEnabled: boolean;
    actions: WorkspaceActions;
  }>({
    dealIds: [firstDealId],
    activeDealId: firstDealId,
    deals: { [firstDealId]: createValtioDeal() },
    streamEnabled: readStreamPreference("valtio"),
    actions: {
      addDeal() {
        const id = crypto.randomUUID();
        workspace.deals[id] = createValtioDeal();
        workspace.dealIds.push(id);
        workspace.activeDealId = id;
        return id;
      },
      setActiveDeal(id) {
        if (workspace.deals[id]) workspace.activeDealId = id;
      },
      toggleSpotPriceStream() {
        workspace.streamEnabled = !workspace.streamEnabled;
        writeStreamPreference("valtio", workspace.streamEnabled);
      },
    },
  });

  const connectStreams = () => connectSpotPriceStreams(
    () => Object.values(workspace.deals).map((deal) => deal.spotPriceStream),
    () => workspace.streamEnabled,
    (listener) => subscribe(workspace, listener),
  );
  return { workspace, connectStreams };
}
