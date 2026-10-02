import { z, type ZodType } from "zod";

/**
 * Fields start empty and are only checked once filled in: `""` for strings,
 * `NaN` for numbers (an empty number input).
 */
export const optionalString = (schema: ZodType) => z.literal("").or(schema);
export const optionalNumber = (schema: ZodType) => z.nan().or(schema);
