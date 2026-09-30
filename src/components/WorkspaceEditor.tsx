import { memo } from "react";
import { Provider, useAtom, useAtomValue } from "jotai/react";
import type { Workspace } from "../state/workspace.ts";
import type { LiveSource, LiveValue } from "../state/liveValue.ts";
import { TextInput } from "./TextInput.tsx";
import { BroadcastInput } from "./BroadcastInput.tsx";
import { LiveValueField } from "./LiveValueField.tsx";
import { RowList } from "./RowList.tsx";

function Status({ workspace }: { workspace: Workspace }) {
  const errorCount = useAtomValue(workspace.errorCount);
  const dirty = useAtomValue(workspace.dirty);
  const rows = useAtomValue(workspace.rows);
  return (
    <p className="status" role="status" aria-label="Workspace status">
      {rows.length.toLocaleString()} rows · {errorCount ? `${errorCount} invalid fields` : "All fields valid"} · {dirty ? "Unsaved changes" : "Unchanged"}
    </p>
  );
}

function Mode({ workspace }: { workspace: Workspace }) {
  const [internal, setInternal] = useAtom(workspace.isInternal);
  const modes = useAtomValue(workspace.availableModes);
  return (
    <label className="mode">
      <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />
      Mode A <span>Available: {modes.join(", ")}</span>
    </label>
  );
}

type Props = { workspace: Workspace; channel: LiveValue; source: LiveSource; streamEnabled: boolean };
export const WorkspaceEditor = memo(function WorkspaceEditor({ workspace, channel, source, streamEnabled }: Props) {
  return (
    <Provider store={workspace.store}>
      <div className="workspace-editor">
        <div className="workspace-toolbar">
          <div><h2>Workspace editor</h2><Status workspace={workspace} /></div>
          <div className="actions">
            <button className="button" onClick={() => workspace.actions.addRows()}>Add row</button>
            <button className="button quiet" onClick={() => workspace.actions.addRows(1_000)}>Add 1,000 rows</button>
          </div>
        </div>
        <section className="shared-fields" aria-label="Shared fields">
          <TextInput field={workspace.baseCode} label="Shared base code" />
          <TextInput field={workspace.quoteCode} label="Shared quote code" />
          <BroadcastInput workspace={workspace} />
          <LiveValueField channel={channel} source={source} enabled={streamEnabled} />
        </section>
        <Mode workspace={workspace} />
        <RowList workspace={workspace} />
      </div>
    </Provider>
  );
});
