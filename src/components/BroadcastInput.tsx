import { useId, useRef, useState } from "react";
import type { Workspace } from "../state/workspace.ts";

export function BroadcastInput({ workspace }: { workspace: Workspace }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const edited = useRef(false);
  function commit() {
    if (!edited.current) return;
    edited.current = false;
    workspace.actions.broadcastLevel(draft);
    setDraft("");
  }
  return (
    <div className="field">
      <label htmlFor={id}>Apply level to all rows</label>
      <input
        id={id}
        value={draft}
        placeholder="Type, then press Enter"
        onChange={(event) => {
          edited.current = true;
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") commit(); }}
        autoComplete="off"
      />
      <span className="field-hint">Enter or blur to apply. Clear the draft to clear every row.</span>
    </div>
  );
}
