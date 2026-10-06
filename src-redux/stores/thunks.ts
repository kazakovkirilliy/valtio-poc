import { calculatePrice } from "@shared/api/calculate.ts";
import { routeWrites } from "@shared/dealWrites.ts";
import { dealOptionsRequests } from "@shared/fields.ts";
import { type GroupType, groupDefinitions, productUi } from "@shared/groups.ts";
import { uuid } from "@shared/lib/uuid.ts";
import type { PathWrite } from "@shared/paths.ts";
import { definitionOf } from "@shared/products/productRegistry.ts";
import { optionsRequestsOf, uniqueRequests } from "@shared/products/productWrites.ts";
import { type SpotPriceStream, createSpotPriceStream } from "@shared/spotPriceStream.ts";
import {
  type OptionsKeyRequest,
  calculationFailed,
  calculationStarted,
  calculationSucceeded,
  dealAdded,
  groupInserted,
  optionsReceived,
  optionsRequestFailed,
  pathsWritten,
  sourceOf,
  toKeyRequests,
} from "./actions.ts";
import { productsOf, selectIsReady } from "./selectors.ts";
import type { GroupState } from "./state.ts";
import type { AppDispatch, AppThunk } from "./store.ts";

/**
 * What can't be in a reducer: new ids, requests, and reading the state to
 * build an event. Each thunk dispatches plain actions; reducers do the rest.
 */

/** Loads options (already counted pending by the action that asked for them). */
const fetchOptions = (dispatch: AppDispatch, requests: readonly OptionsKeyRequest[]) => {
  for (const request of requests) {
    sourceOf(request.sourceId)
      .load(request.param)
      .then(
        (options) => dispatch(optionsReceived({ ...request, options })),
        () => dispatch(optionsRequestFailed(request)),
      );
  }
};

/** A new deal, with its spot price stream; its id. */
export const addDeal = (): AppThunk<string> => (dispatch, _getState, { spotStreams }) => {
  const dealId = uuid();
  spotStreams.set(dealId, createSpotPriceStream());
  // the deal column's own options (its default parameters), loaded with the deal
  const requests = toKeyRequests(dealOptionsRequests);
  dispatch(dealAdded({ dealId, requests }));
  fetchOptions(dispatch, requests);
  return dealId;
};

/** A deal's spot price stream: kept outside the store, ticks never dispatch. */
export const spotStreamOf =
  (dealId: string): AppThunk<SpotPriceStream> =>
  (_dispatch, _getState, { spotStreams }) =>
    spotStreams.get(dealId)!;

/** `source`: a group to clone. Its products' data is shared, not copied: it is immutable. */
const insertGroup =
  (dealId: string, groupType: GroupType, position: number, source?: GroupState): AppThunk =>
  (dispatch, getState) => {
    const deal = getState().deals[dealId];
    if (!deal) return;
    const group: GroupState = { id: uuid(), groupType, productIds: [], products: {} };
    groupDefinitions[groupType].productTypes.forEach((productType, index) => {
      const id = uuid();
      const data = source
        ? source.products[source.productIds[index]].data
        : definitionOf(productType).createData(deal.dealFields);
      group.products[id] = { id, ui: productUi(productType, index), data };
      group.productIds.push(id);
    });
    const requests = toKeyRequests(
      uniqueRequests(group.productIds.flatMap((id) => optionsRequestsOf(group.products[id].data))),
    );
    dispatch(groupInserted({ dealId, position, group, requests }));
    fetchOptions(dispatch, requests);
  };

export const addGroup =
  (dealId: string, groupType: GroupType): AppThunk =>
  (dispatch, getState) =>
    dispatch(insertGroup(dealId, groupType, getState().deals[dealId]?.groupIds.length ?? 0));

/** Inserts a copy of the group (and its products) right after it. */
export const cloneGroup =
  (dealId: string, groupId: string): AppThunk =>
  (dispatch, getState) => {
    const deal = getState().deals[dealId];
    const source = deal?.groups[groupId];
    if (!source) return;
    dispatch(insertGroup(dealId, source.groupType, deal.groupIds.indexOf(groupId) + 1, source));
  };

/** Writes values at dot paths, in order, as one action: an edit, a paste, anything. */
export const writePaths =
  (dealId: string, writes: readonly PathWrite[]): AppThunk =>
  (dispatch, getState) => {
    const deal = getState().deals[dealId];
    if (!deal) return;
    // the deal logic and routing read the state: decided here, applied by the reducers
    const routed = routeWrites(
      { dealFields: deal.dealFields, settings: deal.settings, products: productsOf(deal) },
      writes,
    );
    const requests = toKeyRequests(routed.requests);
    dispatch(
      pathsWritten({
        dealId,
        writes,
        dealFields: routed.dealFields,
        settings: routed.settings,
        products: [...routed.products].map(([productId, { groupId, writes }]) => ({ groupId, productId, writes })),
        requests,
      }),
    );
    fetchOptions(dispatch, requests);
  };

/** Calculates now, if ready (the manual Calculate, and autocalc). */
export const calculate =
  (dealId: string): AppThunk =>
  (dispatch, getState) => {
    const state = getState();
    if (!selectIsReady(state, dealId)) return;
    const deal = state.deals[dealId];
    const requestId = deal.calc.requestId + 1;
    dispatch(calculationStarted({ dealId, requestId }));
    // the products are read now, like a request body
    calculatePrice(productsOf(deal).map(({ data }) => data)).then(
      (price) => dispatch(calculationSucceeded({ dealId, requestId, price })),
      () => dispatch(calculationFailed({ dealId, requestId })),
    );
  };
