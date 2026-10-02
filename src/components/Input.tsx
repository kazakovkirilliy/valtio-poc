import { useId, memo, useCallback, useState, useRef, Profiler } from "react";
import { useDealId, useStoreBindings } from "../contexts/StoreProvider.tsx";
import type { FieldPath } from "../stores/domain.ts";

type Props = {
  path: FieldPath;
  label: string;
};

export const Input = memo(({ path, label }: Props) => {
  const id = useId();
  const bindings = useStoreBindings();
  const dealId = useDealId();
  const { value, issues } = bindings.useField(dealId, path);
  const actions = bindings.getDealActions(dealId);
  const count = useRef(0);
  const counter = useRef<HTMLSpanElement>(null);
  const onRender = useCallback(() => {
    count.current += 1;
    if (counter.current) counter.current.textContent = `${count.current} commits`;
  }, []);
  return (
    <Profiler id={path} onRender={onRender}>
      <div className="field" data-field-path={path}>
        <div className="field-label">
          <label htmlFor={id}>{label}</label>
          <span ref={counter} className="render-count" title="React commits since this field mounted">
            0 commits
          </span>
        </div>
        <input id={id} value={value} className={issues.length ? "hasError" : ""}
          aria-invalid={issues.length > 0}
          aria-describedby={issues.length ? `${id}-error` : undefined}
          onChange={(event) => actions.setField(path, event.target.value)} />
        {issues.length > 0 ? (
          <small className="field-error" id={`${id}-error`}>{issues[0].message}</small>
        ) : null}
      </div>
    </Profiler>
  );
});
Input.displayName = "Input";

export const BroadcastStrikeField = memo(() => {
  const id = useId();
  const bindings = useStoreBindings();
  const actions = bindings.getDealActions(useDealId());
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const commit = () => {
    if (!dirty) return;
    actions.broadcastStrike(draft);
    setDraft("");
    setDirty(false);
  };
  return (
    <div className="field broadcast-field">
      <label htmlFor={id}>Strike (broadcast)</label>
      <input id={id} value={draft} aria-describedby={`${id}-hint`}
        onChange={(event) => { setDraft(event.target.value); setDirty(true); }}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") commit(); }} />
      <small id={`${id}-hint`}>Enter or blur applies to every product. Clear a draft to broadcast an empty value.</small>
    </div>
  );
});
BroadcastStrikeField.displayName = "BroadcastStrikeField";
