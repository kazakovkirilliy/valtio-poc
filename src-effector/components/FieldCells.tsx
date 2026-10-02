import type { ReactNode } from "react";
import { type FieldId, fields as fieldDefinitions } from "../stores/fields.ts";

type Props = {
  /** The column's field components, by field id. */
  fields: Partial<Record<FieldId, ReactNode>>;
};

/**
 * One cell per field, in `fields.ts` order — empty where the column has no
 * such field — so every column stays aligned with the label column.
 */
export const FieldCells = ({ fields }: Props) =>
  fieldDefinitions.map(({ id }) => (
    <div key={id} className="cell">
      {fields[id]}
    </div>
  ));
