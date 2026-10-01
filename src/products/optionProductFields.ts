import { z, type ZodType } from "zod";
import type { LeafPath } from "../lib/path.ts";
import type { ProductFieldId } from "../fields/fields.ts";
import type { VanillaProductStore } from "./vanillaProductStore.ts";

/**
 * Per-field facts of the option products (Vanilla, Average): where each
 * field lives in the product, and how it is validated. The store (syncs,
 * broadcasts, validation) and the column (inputs) both read from here.
 */

/** The block Vanilla calls `optionsCommon` and Average calls `avroCommon`. */
export type OptionsCommon = VanillaProductStore["data"]["optionsCommon"];
export type CommonKey = "optionsCommon" | "avroCommon";
/** `data` fields outside the common block. */
export type SharedData = Omit<
  VanillaProductStore["data"],
  "productType" | "optionsCommon"
>;

/** Product-relative path of every field, typed against the shared shapes. */
export const optionProductFieldPaths = (
  commonKey: CommonKey,
): Record<ProductFieldId, string> => {
  const common = (rest: LeafPath<OptionsCommon>) => `data.${commonKey}.${rest}`;
  const data = (rest: LeafPath<SharedData>) => `data.${rest}`;

  return {
    notionalCcy: common("base.notional.notionalCcy"),
    notionalAmount: common("base.notional.amount"),
    premiumCcy: common("base.premiumCcy"),
    strike: common("strike"),
    callPut: common("callPut"),
    buySell: common("base.buySell"),
    ccyPair: common("base.ccyPair"),
    expiryDate: common("base.expiryDate"),
    expiryDays: common("base.expiryDays"),
    expiryCut: common("base.expiryCut"),
    deliveryDate: common("base.deliveryDate"),
    premiumDate: common("base.premiumDate"),
    settlementStyle: data("settlementStyle"),
    settlementCcy: data("cashSettlement.settlementCcy"),
    settlementFixingSource: data("cashSettlement.settlementFixingSource"),
  };
};

/**
 * Fields start empty and are only checked once filled in: `""` for strings,
 * `NaN` for numbers (an empty number input).
 */
const optionalString = (schema: ZodType) => z.literal("").or(schema);
const optionalNumber = (schema: ZodType) => z.nan().or(schema);

const ccySchema = z.string().max(6, "Must be at most 6 characters");
const dateSchema = optionalString(z.iso.date("Must be a valid date"));

export const optionProductSchemas: Record<ProductFieldId, ZodType> = {
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
