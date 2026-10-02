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
import type { ProductFieldId } from "../fields.ts";

export type VanillaProductStore = {
  ui: {
    title: string;
    index: number;
  };
  data: {
    productType: "VanillaProduct";
    cashSettlement: {
      settlementCcy: string;
      settlementFixingSource: string;
    };
    optionsCommon: {
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

/** A Vanilla product: its state, plus what the UI and the deal use. */
export type VanillaProduct = VanillaProductStore & {
  readonly id: string;
  /** One model per field, for the inputs. */
  readonly fields: Record<ProductFieldId, FieldModel>;
  readonly hasValidationErrors: boolean;
  setField(id: ProductFieldId, value: unknown): void;
};

/** Where each field row lives in a Vanilla product. */
const fieldPaths: Record<ProductFieldId, LeafPath<VanillaProductStore>> = {
  notionalCcy: "data.optionsCommon.base.notional.notionalCcy",
  notionalAmount: "data.optionsCommon.base.notional.amount",
  premiumCcy: "data.optionsCommon.base.premiumCcy",
  strike: "data.optionsCommon.strike",
  callPut: "data.optionsCommon.callPut",
  buySell: "data.optionsCommon.base.buySell",
  ccyPair: "data.optionsCommon.base.ccyPair",
  expiryDate: "data.optionsCommon.base.expiryDate",
  expiryDays: "data.optionsCommon.base.expiryDays",
  expiryCut: "data.optionsCommon.base.expiryCut",
  deliveryDate: "data.optionsCommon.base.deliveryDate",
  premiumDate: "data.optionsCommon.base.premiumDate",
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
  settlementStyle: optionalString(z.enum(["Physical", "Cash"])),
  settlementCcy: ccySchema,
  settlementFixingSource: z.string().max(20, "Must be at most 20 characters"),
};

/**
 * Rules across fields, listed under the field that shows the issue. MobX
 * tracks the dates each rule reads, so it re-runs when either changes.
 */
const crossFieldRules: Partial<
  Record<ProductFieldId, CrossFieldRule<VanillaProductStore>[]>
> = {
  deliveryDate: [
    {
      message: "Delivery date can't be before expiry date",
      isValid: ({ data }) =>
        isOnOrAfter(
          data.optionsCommon.base.deliveryDate,
          data.optionsCommon.base.expiryDate,
        ),
    },
  ],
};

const createData = (owner: ProductOwner): VanillaProductStore["data"] => ({
  productType: "VanillaProduct",
  cashSettlement: {
    settlementCcy: "",
    settlementFixingSource: "",
  },
  optionsCommon: {
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
  settlementStyle: "",
});

/**
 * Makes `expiryDays` a getter over `expiryDate`, which `observable` turns
 * into a computed: always in step with the date, nothing to subscribe to or
 * dispose. (`toJS` leaves computeds out, so a clone's plain data gets the
 * getter added back here.)
 */
const withDerivedFields = (data: VanillaProductStore["data"]) => {
  Object.defineProperty(data.optionsCommon.base, "expiryDays", {
    get(this: VanillaProductStore["data"]["optionsCommon"]["base"]) {
      return daysUntil(this.expiryDate);
    },
    enumerable: true,
    configurable: true,
  });
  return data;
};

/**
 * Vanilla product factory. `source` is plain data to copy (a clone);
 * otherwise the product starts from defaults and the deal's ccys.
 */
export const createVanillaProduct = (
  owner: ProductOwner,
  ui: VanillaProductStore["ui"],
  source?: VanillaProductStore["data"],
): VanillaProduct => {
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

  const product: VanillaProduct = observable<VanillaProduct>(
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
