import type { ReactNode } from "react";
import { type FieldId, fields } from "./fields.ts";
import { Input } from "./Input.tsx";

/** Binds a field to a store path; the input type comes from `fields.ts`. */
export type FieldBinding = {
  path: string;
  isBroadcasting?: boolean;
  readOnly?: boolean;
};

export type FieldBindings = Partial<Record<FieldId, FieldBinding>>;

type Props = {
  bindings: FieldBindings;
  /** Fields with a component of their own, e.g. the spot stream. */
  custom?: Partial<Record<FieldId, ReactNode>>;
};

/**
 * One cell per field, in `fields` order — empty where the column has no such
 * field — so every column stays aligned with the label column.
 */
export const FieldCells = ({ bindings, custom }: Props) =>
  fields.map(({ id, label, input }) => {
    const binding = bindings[id];
    return (
      <div key={id} className="cell">
        {binding ? (
          <Input
            label={label}
            type={input}
            path={binding.path}
            isBroadcasting={binding.isBroadcasting}
            readOnly={binding.readOnly}
          />
        ) : (
          custom?.[id]
        )}
      </div>
    );
  });
