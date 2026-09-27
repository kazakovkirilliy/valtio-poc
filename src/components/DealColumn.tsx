import {memo} from "react";
import {PremiumCcyField} from "./PremiumCcyField.tsx";

export const DealColumn = memo(() => {
    return (
        <div className="column">
            <h5>Deal Column</h5>
            <PremiumCcyField path="premiumCcy" actionPath="actions.setPremiumCcy" />
        </div>
    );
});
