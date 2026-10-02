import { memo, Profiler, useCallback, useId, useRef, useState } from "react";
import { useDealId, useStoreBindings } from "../StoreProvider.tsx";
import type { FieldTarget, FieldValue, BroadcastFieldId } from "../domain.ts";
import type { InputType } from "../fields.ts";

type Props = {
  target: FieldTarget;
  label: string;
  path: string;
  type: InputType;
  readOnly?: boolean;
};
const displayValue = (value: FieldValue) => typeof value === "number" && Number.isNaN(value) ? "" : String(value);
const committedValue = (draft: string, type: InputType) => type === "number" ?
  (draft === "" ? NaN : Number(draft)) : draft;

/** Like upstream, edits stay local until Enter/blur; validation observes committed values. */
export const Input = memo(({ target, label, path, type, readOnly = false }: Props) => {
  const bindings = useStoreBindings();
  const dealId = useDealId();
  const { value, issues } = bindings.useField(dealId, target);
  const actions = bindings.getDealActions(dealId);
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  const count = useRef(0);
  const badge = useRef<HTMLSpanElement>(null);
  const onRender = useCallback(() => {
    count.current += 1;
    if (badge.current) badge.current.textContent = `${count.current} commit${count.current === 1 ? "" : "s"}`;
  }, []);
  const commit = () => {
    if (draft === null || readOnly) return;
    setDraft(null);
    actions.setField(target, committedValue(draft, type));
  };
  return (
    <Profiler id={path} onRender={onRender}>
      <div className="editor-field" data-field-path={path}>
        <input className={`input ${issues.length ? "input--error" : ""}`} type={type}
          id={id} aria-label={label} readOnly={readOnly} value={draft ?? displayValue(value)}
          aria-invalid={issues.length > 0} aria-describedby={issues.length ? `${id}-error` : undefined}
          onChange={(event) => setDraft(event.target.value)} onBlur={commit}
          onKeyDown={(event) => { if (event.key === "Enter") commit(); }} />
        <span ref={badge} className="render-count" title="React commits since this field mounted">0 commits</span>
        {issues.length ? <small className="field-error" id={`${id}-error`}>{issues[0].message}</small> : null}
      </div>
    </Profiler>
  );
});
Input.displayName = "Input";

export const BroadcastInput = memo(({ field, label, type }: {
  field: BroadcastFieldId; label: string; type: InputType;
}) => {
  const bindings = useStoreBindings();
  const actions = bindings.getDealActions(useDealId());
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (!draft) return; // Match upstream: an empty broadcast is a no-op.
    actions.broadcast(field, committedValue(draft, type));
  };
  return (
    <div className="editor-field broadcast-field" data-broadcast-field={field}>
      <input className="input" aria-label={label} type={type} value={draft ?? ""}
        onChange={(event) => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") commit(); }} />
    </div>
  );
});
BroadcastInput.displayName = "BroadcastInput";
