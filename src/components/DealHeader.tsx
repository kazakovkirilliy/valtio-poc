import { useDealId, useStoreBindings } from "../contexts/StoreProvider.tsx";
import { memo } from "react";

export const DealHeader = memo(() => {
  const bindings = useStoreBindings();
  const dealId = useDealId();
  const { streamEnabled, actions } = bindings.useWorkspace();
  const { isInternal, hedgeTypes, hasValidationErrors } = bindings.useDealMeta(dealId);
  const dealActions = bindings.getDealActions(dealId);

  return (
    <div className="deal__header">
      <button className="button" onClick={() => dealActions.addProduct()}>
        Add New Product
      </button>

      <button className="button" onClick={actions.toggleSpotPriceStream}>
        Toggle Spot Price Stream ({streamEnabled ? "Enabled" : "Disabled"})
      </button>
      <label className="internal-toggle">
        <input type="checkbox" checked={isInternal}
          onChange={(event) => dealActions.setInternal(event.target.checked)} />
        Internal deal
      </label>
      <span>Hedge types: <strong>{hedgeTypes.join(", ")}</strong></span>
      <span className={hasValidationErrors ? "validation-status invalid" : "validation-status"}
        role="status">
        {hasValidationErrors ? "Product validation errors" : "All products valid"}
      </span>
    </div>
  );
});

DealHeader.displayName = "DealHeader";
