import {Input} from "./Input.tsx";
import {useSnapshot} from "valtio/react";
import {dealStore} from "../stores/dealStore.ts";
import {memo} from "react";
import {PremiumCcyField} from "./PremiumCcyField.tsx";

type Props = {
    productId: string
};

export const ProductColumn = memo(({productId}: Props) => {

    const snap = useSnapshot(dealStore);

    const product = snap.products[productId];

    return (
        <div className="column">
            <h5>Product Column</h5>
            <PremiumCcyField path={`products.${productId}.productPremiumCcy`}
                             actionPath={`products.${productId}.actions.setProductPremiumCcy`}
            />
            <Input
                label="Strike"
                value={product.strike}
                onChange={product.actions.setProductStrike}
            />
        </div>
    );
});
