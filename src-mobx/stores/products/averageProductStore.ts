import { observable } from "mobx";
import { z, type ZodType } from "zod";
import { daysUntil, isOnOrAfter } from "../../lib/date.ts";
import {
  type LeafPath,
  getValueByPath,
  setValueByPath,
} from "../../lib/path.ts";
import { optionalNumber, optionalString } from "../../lib/schemas.ts";
import { uuid } from "../../lib/uuid.ts";
import { type ProductOwner, isSyncedField } from "../dealFields.ts";
import {
  type CrossFieldRule,
  type FieldModel,
  createFieldModel,
} from "../fieldModel.ts";
import { settlementStyleStore } from "../settlementStyleStore.ts";
import type { ProductFieldId } from "../fields.ts";

export type AverageProductStore = {
  ui: {
    title: string;
    index: number;
  };
  data: {
    productType: "AverageProduct";
    cashSettlement: {
      settlementCcy: string;
      settlementFixingSource: string;
    };
    avroCommon: {
      base: {
        buySell: string;
        ccyPair: string;
        deliveryDate: string;
        expiryCut: string;
        expiryDate: string;
        expiryDays: number;
        notional: {
          notionalCcy: string;
          amount: number;
        };
        premiumCcy: string;
        premiumDate: string;
      };
      callPut: string;
      strike: string;
    };
    settlementStyle: string;
  };
};

/** An Average product: its state, plus what the UI and the deal use. */
export type AverageProduct = AverageProductStore & {
  readonly id: string;
  /** One model per field, for the inputs. */
  readonly fields: Record<ProductFieldId, FieldModel>;
  readonly hasValidationErrors: boolean;
  setField(id: ProductFieldId, value: unknown): void;
};

/** Where each field row lives in an Average product. */
const fieldPaths: Record<ProductFieldId, LeafPath<AverageProductStore>> = {
  notionalCcy: "data.avroCommon.base.notional.notionalCcy",
  notionalAmount: "data.avroCommon.base.notional.amount",
  premiumCcy: "data.avroCommon.base.premiumCcy",
  strike: "data.avroCommon.strike",
  callPut: "data.avroCommon.callPut",
  buySell: "data.avroCommon.base.buySell",
  ccyPair: "data.avroCommon.base.ccyPair",
  expiryDate: "data.avroCommon.base.expiryDate",
  expiryDays: "data.avroCommon.base.expiryDays",
  expiryCut: "data.avroCommon.base.expiryCut",
  deliveryDate: "data.avroCommon.base.deliveryDate",
  premiumDate: "data.avroCommon.base.premiumDate",
  settlementStyle: "data.settlementStyle",
  settlementCcy: "data.cashSettlement.settlementCcy",
  settlementFixingSource: "data.cashSettlement.settlementFixingSource",
};

/** Derived fields: shown read-only, never written. */
const readOnlyFields: ReadonlySet<ProductFieldId> = new Set(["expiryDays"]);

const ccySchema = z.string().max(6, "Must be at most 6 characters");
const dateSchema = optionalString(z.iso.date("Must be a valid date"));

const schemas: Record<ProductFieldId, ZodType> = {
  notionalCcy: ccySchema,
  notionalAmount: optionalNumber(z.number().positive("Must be greater than 0")),
  premiumCcy: ccySchema,
  strike: z.string().max(3, "Must be at most 3 characters"),
  callPut: optionalString(z.enum(["Call", "Put"])),
  buySell: optionalString(z.enum(["Buy", "Sell"])),
  ccyPair: optionalString(
    z.string().regex(/^[A-Z]{6}$/, "Must be 6 uppercase letters, e.g. EURUSD"),
  ),
  expiryDate: dateSchema,
  expiryDays: optionalNumber(
    z.number().int().min(0, "Expiry date is in the past"),
  ),
  expiryCut: z.string().max(10, "Must be at most 10 characters"),
  deliveryDate: dateSchema,
  premiumDate: dateSchema,
  // an option id; the options themselves come from the API
  settlementStyle: z.string(),
  settlementCcy: ccySchema,
  settlementFixingSource: z.string().max(20, "Must be at most 20 characters"),
};

/**
 * Rules across fields, listed under the field that shows the issue. MobX
 * tracks the dates each rule reads, so it re-runs when either changes.
 */
const crossFieldRules: Partial<
  Record<ProductFieldId, CrossFieldRule<AverageProductStore>[]>
> = {
  deliveryDate: [
    {
      message: "Delivery date can't be before expiry date",
      isValid: ({ data }) =>
        isOnOrAfter(
          data.avroCommon.base.deliveryDate,
          data.avroCommon.base.expiryDate,
        ),
    },
  ],
};

const createData = (owner: ProductOwner): AverageProductStore["data"] => ({
  productType: "AverageProduct",
  cashSettlement: {
    settlementCcy: "",
    settlementFixingSource: "",
  },
  avroCommon: {
    base: {
      buySell: "",
      ccyPair: "",
      deliveryDate: "",
      expiryCut: "",
      expiryDate: "",
      expiryDays: NaN, // replaced by a computed getter (withDerivedFields)
      notional: {
        notionalCcy: owner.notionalCcy,
        amount: NaN,
      },
      premiumCcy: owner.premiumCcy,
      premiumDate: "",
    },
    callPut: "",
    strike: "",
  },
  // the first option once loaded; until then the deal fills it in on load
  settlementStyle: settlementStyleStore.firstValue,
});

/**
 * Makes `expiryDays` a getter over `expiryDate`, which `observable` turns
 * into a computed: always in step with the date, nothing to subscribe to or
 * dispose. (`toJS` leaves computeds out, so a clone's plain data gets the
 * getter added back here.)
 */
const withDerivedFields = (data: AverageProductStore["data"]) => {
  Object.defineProperty(data.avroCommon.base, "expiryDays", {
    get(this: AverageProductStore["data"]["avroCommon"]["base"]) {
      return daysUntil(this.expiryDate);
    },
    enumerable: true,
    configurable: true,
  });
  return data;
};

/**
 * Average product factory. `source` is plain data to copy (a clone);
 * otherwise the product starts from defaults and the deal's ccys.
 */
export const createAverageProduct = (
  owner: ProductOwner,
  ui: AverageProductStore["ui"],
  source?: AverageProductStore["data"],
): AverageProduct => {
  const fields = Object.fromEntries(
    (Object.keys(fieldPaths) as ProductFieldId[]).map((id) => [
      id,
      createFieldModel({
        read: () => getValueByPath(product, fieldPaths[id]),
        schema: schemas[id],
        rules: crossFieldRules[id]?.map(({ message, isValid }) => ({
          message,
          isValid: () => isValid(product),
        })),
        readOnly: readOnlyFields.has(id),
        // ccy commits go through the deal, which writes every product
        commit: (value) =>
          isSyncedField(id)
            ? owner.setSynced(id, String(value))
            : product.setField(id, value),
      }),
    ]),
  ) as Record<ProductFieldId, FieldModel>;

  const product: AverageProduct = observable<AverageProduct>(
    {
      id: uuid(),
      ui,
      data: withDerivedFields(source ?? createData(owner)),
      fields,
      get hasValidationErrors() {
        return Object.values(fields).some((field) => field.issues.length > 0);
      },
      setField(id, value) {
        if (readOnlyFields.has(id)) return; // derived: never written
        setValueByPath(product, fieldPaths[id], value);
      },
    },
    { id: false, fields: false },
    { autoBind: true },
  );

  return product;
};
