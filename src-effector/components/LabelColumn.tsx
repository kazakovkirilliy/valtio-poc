import { memo } from "react";
import { fields } from "../stores/fields.ts";

/** The only visible field labels; every other column aligns to these rows. */
export const LabelColumn = memo(() => (
  <div className="column column--labels">
    <div className="column__header column__header--span" />
    {fields.map(({ id, label }) => (
      <div key={id} className="cell cell--label">
        {label}
      </div>
    ))}
  </div>
));

LabelColumn.displayName = "LabelColumn";
