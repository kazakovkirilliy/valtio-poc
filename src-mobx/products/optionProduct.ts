import { computed, makeAutoObservable } from "mobx";
import { type ProductFieldId, fields } from "../fields/fields.ts";
import { type FieldModel, noIssues } from "../fields/FieldModel.ts";
import { daysUntil } from "../lib/date.ts";
import { getValueByPath, setValueByPath } from "../lib/path.ts";
import { uuid } from "../lib/uuid.ts";
import type { VanillaProductData } from "./vanillaProductStore.ts";
import type { AverageProductData } from "./averageProductStore.ts";
import {
  type CommonKey,
  type OptionsCommon,
  type SharedData,
  optionProductFieldPaths,
  optionProductSchemas,
} from "./optionProductFields.ts";

/**
 * Store of the option products (Vanilla, Average). They are identical except
 * for the name of the common block: `optionsCommon` / `avroCommon`.
 * Per-field paths and schemas live in `optionProductFields.ts`.
 */
export type OptionProductData = VanillaProductData | AverageProductData;
export type ProductUi = { title: string; index: number };

/** Fields the deal keeps in step with every product (two-way). */
export const syncedFieldIds = ["notionalCcy", "premiumCcy"] as const;
export type SyncedFieldId = (typeof syncedFieldIds)[number];
const isSyncedField = (id: ProductFieldId): id is SyncedFieldId =>
  (syncedFieldIds as readonly string[]).includes(id);

/** Every other writable product field is broadcast from the deal. */
export type BroadcastFieldId = Exclude<
  ProductFieldId,
  SyncedFieldId | "expiryDays"
>;
export const broadcastFieldIds = fields
  .map(({ id }) => id)
  .filter(
    (id): id is BroadcastFieldId =>
      id !== "spotStream" &&
      id !== "expiryDays" &&
      !isSyncedField(id as ProductFieldId),
  );

/** The deal, as a product sees it: starting values and the two-way sync. */
export type ProductOwner = {
  readonly notionalCcy: string;
  readonly premiumCcy: string;
  setSynced(id: SyncedFieldId, value: string): void;
};

export const createOptionsCommon = (owner: ProductOwner): OptionsCommon => ({
  base: {
    buySell: "",
    ccyPair: "",
    deliveryDate: "",
    expiryCut: "",
    expiryDate: "",
    expiryDays: NaN, // replaced by a computed getter in OptionProduct
    notional: {
      notionalCcy: owner.notionalCcy,
      amount: NaN,
    },
    premiumCcy: owner.premiumCcy,
    premiumDate: "",
  },
  callPut: "",
  strike: "",
});

export const createSharedData = (): SharedData => ({
  cashSettlement: {
    settlementCcy: "",
    settlementFixingSource: "",
  },
  settlementStyle: "",
});

const commonKeyOf = (data: OptionProductData): CommonKey =>
  "optionsCommon" in data ? "optionsCommon" : "avroCommon";

/**
 * Turns `expiryDays` into a getter over `expiryDate`, which
 * `makeAutoObservable` makes a computed: always in step with the date, with
 * nothing to subscribe to or dispose. (`toJS` leaves computeds out, so a
 * clone's plain data gets the getter added back here.)
 */
const withDerivedFields = (data: OptionProductData) => {
  const { base } =
    "optionsCommon" in data ? data.optionsCommon : data.avroCommon;
  Object.defineProperty(base, "expiryDays", {
    get(this: OptionsCommon["base"]) {
      return daysUntil(this.expiryDate);
    },
    enumerable: true,
    configurable: true,
  });
  return data;
};

export class OptionProduct {
  readonly id = uuid();
  ui: ProductUi;
  data: OptionProductData;
  /** Path of every field from the product itself (`data.…`). */
  readonly paths: Record<ProductFieldId, string>;
  /** One model per field, for the inputs. */
  readonly fields: Record<ProductFieldId, FieldModel>;

  /** `data` must be plain (fresh defaults, or `toJS` of a product to clone). */
  constructor(data: OptionProductData, owner: ProductOwner, ui: ProductUi) {
    this.ui = ui;
    this.data = withDerivedFields(data);
    this.paths = optionProductFieldPaths(commonKeyOf(data));

    const entries = (Object.keys(this.paths) as ProductFieldId[]).map(
      (id): [ProductFieldId, FieldModel] => {
        const read = () => getValueByPath(this, this.paths[id]);
        // validation is derived: cached while an input shows it, recomputed
        // only when this field's value changes, gone when the product is
        const issues = computed(() => {
          const result = optionProductSchemas[id].safeParse(read());
          return result.success ? noIssues : result.error.issues;
        });
        return [
          id,
          {
            get value() {
              return read();
            },
            get issues() {
              return issues.get();
            },
            readOnly: id === "expiryDays", // derived from expiryDate
            commit: (value) => {
              if (id === "expiryDays") return; // derived: never written
              // ccy commits go through the deal, which writes every product
              if (isSyncedField(id)) owner.setSynced(id, String(value));
              else this.setField(id, value);
            },
          },
        ];
      },
    );
    this.fields = Object.fromEntries(entries) as Record<
      ProductFieldId,
      FieldModel
    >;

    makeAutoObservable(
      this,
      { id: false, paths: false, fields: false },
      { autoBind: true },
    );
  }

  get productType() {
    return this.data.productType;
  }

  get hasValidationErrors() {
    return Object.values(this.fields).some((field) => field.issues.length > 0);
  }

  setField(id: Exclude<ProductFieldId, "expiryDays">, value: unknown) {
    setValueByPath(this, this.paths[id], value);
  }
}
