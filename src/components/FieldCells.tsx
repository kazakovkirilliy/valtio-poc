import type { ReactNode } from "react";
import { type FieldId, fieldRows } from "./fieldRows.ts";

type Props = {
  fields: Partial<Record<FieldId, ReactNode>>;
};

/**
 * One cell per field row, in `fieldRows` order — empty where the column has
 * no such field — so every column stays aligned with the label column.
 */
export const FieldCells = ({ fields }: Props) =>
  fieldRows.map(({ id }) => (
    <div key={id} className="cell">
      {fields[id]}
    </div>
  ));
