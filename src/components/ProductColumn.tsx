import {memo} from "react";
import {Input} from "./Input.tsx";

type Props = {
    productId: string
};

export const ProductColumn = memo(({productId}: Props) => {

    return (
        <div className="column">
            <h5>Product Column</h5>
            <Input
                label="Notional Ccy"
                path={`products.${productId}.productNotionalCcy`}
            />
            <Input
                label="Premium Ccy"
                path={`products.${productId}.productPremiumCcy`}
            />
            <Input
                label="Strike"
                path={`products.${productId}.strike`}
            />

        </div>
    );
});

ProductColumn.displayName = "ProductColumn";