import type { ReactNode } from "react";
import { type FieldId, fields as fieldDefinitions } from "../../stores/fields.ts";
import type { FieldModel } from "../../stores/fieldModel.ts";
import { Input } from "../fields/Input.tsx";

type Props = {
  /** Store-backed fields; the input type comes from `fields.ts`. */
  fields: Partial<Record<FieldId, FieldModel>>;
  /** Fields with a component of their own, e.g. the spot stream. */
  custom?: Partial<Record<FieldId, ReactNode>>;
};

/**
 * One cell per field, in `fields.ts` order — empty where the column has no
 * such field — so every column stays aligned with the label column.
 */
export const FieldCells = ({ fields, custom }: Props) =>
  fieldDefinitions.map(({ id, label, input }) => {
    const field = fields[id];
    return (
      <div key={id} className="cell">
        {field ? (
          <Input field={field} label={label} type={input} />
        ) : (
          custom?.[id]
        )}
      </div>
    );
  });
