import { ComponentProps } from "react";

type Product = unknown;
type DeepKeyFiltered = unknown;
type BoolLogicProps = unknown; /*boolean conditions*/

type PositionProps = {
  field: DeepKeyFiltered<Record<string, string>, { label: string }>;
};

type ProductFieldDefinition<T extends Product> = {
  type: string;
  props: ComponentProps<any>;
  position: unknown;
  forceAutoFocus?: boolean;
  visibility?: {
    if?: BoolLogicProps<T>;
    path: DeepKeyFiltered<T, boolean>;
  };
  enabled?: {
    if?: BoolLogicProps<T>;
  };
  validation?: {
    schema?: ValidationSchemaProps<T>;
    partialSchema?: ValidationSchemaProps<T>;
    fullSchema?: ValidationSchemaProps<T>;
    partialPath?: ValidationSchemaProps<T>;
  };
  aggregation?: AggregationFieldDefintion<T>;
  action?: ActionFieldDefintion<T>;
  hideWhenSectionIsCollapsed?: boolean;
};
export const fields = [
  {
    type: "CurrencyPairSelector",
    props: {
      path: "g.$GROUP_ID.p.$PRODUCT_ID.data.optionsCommon.base.ccyPair",
    },
    position: {
      field: "TradeSection.fields.CurrencyPair",
    },
    aggregation: {
      type: "CurrencyPairSelector",
      props: {
        path: "$aggregationVirtualFields.ccyPair",
      },
    },
  },
  {
    type: "Amount",
    props: {
      path: "g.$GROUP_ID.p.$PRODUCT_ID.data.optionsCommon.base.notional",
    },
    position: {
      field: "TradeSection.fields.NotionalAmount",
    },
    validation: {
      schema: [
        "g.$GROUP_ID.p.$PRODUCT_ID.data.optionsCommon.base.notional",
        Notional_Zod_shema,
      ],
    },
    aggregation: {
      type: "Amount",
      props: {
        path: "$aggregationVirtualFields.notional",
      },
    },
  },
  {
    type: "CcySelect",
    props: {
      path: "g.$GROUP_ID.p.$PRODUCT_ID.data.cashSettelement.settlementCcy",
    },
    position: {
      field: "TradeSection.fields.SettelementCcy",
    },
    visibility: {
      if: ["g.$GROUP_ID.p.$PRODUCT_ID.data.settelementStyle", "CASH"],
    },
    aggregation: {
      type: "CcySelect",
      props: {
        path: "g.$GROUP_ID.p.$PRODUCT_ID.data.cashSettelement.settlementCcy",
      },
    },
  },
];
