import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { createWorkspace } from "./state/workspace.ts";
import { createLiveValue, demoSource } from "./state/liveValue.ts";
import { WorkspaceEditor } from "./components/WorkspaceEditor.tsx";

const preferencesKey = "workspace-ui:v1";
function readStreamPreference(): boolean {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(preferencesKey) ?? "null");
    if (value && typeof value === "object" && "streamEnabled" in value && typeof value.streamEnabled === "boolean") return value.streamEnabled;
  } catch { /* Storage is optional; the editor still works without it. */ }
  return true;
}

function createEntry(number: number) {
  return { workspace: createWorkspace(), channel: createLiveValue(), name: `Tab ${number}` };
}

export default function App() {
  const [session, setSession] = useState(() => {
    const entry = createEntry(1);
    return { entries: [entry], activeId: entry.workspace.id, nextNumber: 2 };
  });
  const [streamEnabled, setStreamEnabled] = useState(readStreamPreference);
  const toggleStream = useCallback(() => setStreamEnabled((current) => !current), []);
  const active = session.entries.find((entry) => entry.workspace.id === session.activeId);
  useEffect(() => {
    try { localStorage.setItem(preferencesKey, JSON.stringify({ streamEnabled })); } catch { /* Optional preference only. */ }
  }, [streamEnabled]);

  function addWorkspace() {
    const entry = createEntry(session.nextNumber);
    setSession((current) => ({ entries: [...current.entries, entry], activeId: entry.workspace.id, nextNumber: current.nextNumber + 1 }));
  }
  function closeWorkspace(id: string) {
    const entry = session.entries.find((candidate) => candidate.workspace.id === id);
    if (entry?.workspace.store.get(entry.workspace.dirty) && !window.confirm("Discard unsaved changes and close this deal?")) return;
    setSession((current) => {
      const entries = current.entries.filter((entry) => entry.workspace.id !== id);
      return { ...current, entries, activeId: current.activeId === id ? entries[0]?.workspace.id ?? "" : current.activeId };
    });
  }

  return (
    <main>
      <h1 className="sr-only">Deal editor</h1>
      <nav className="multiDeal-header" aria-label="Deals">
        {session.entries.map((entry) => (
          <div className="tab-group" key={entry.workspace.id}>
            <button className={`button tab ${entry.workspace.id === session.activeId ? "active" : ""}`} aria-pressed={entry.workspace.id === session.activeId} onClick={() => setSession((current) => ({ ...current, activeId: entry.workspace.id }))}>{entry.name}</button>
            <button className="button close-tab" aria-label={`Close ${entry.name}`} onClick={() => closeWorkspace(entry.workspace.id)}>×</button>
          </div>
        ))}
        <button className="button quiet" onClick={addWorkspace}>Add New Deal</button>
      </nav>
      {active ? (
        <WorkspaceEditor
          key={active.workspace.id}
          workspace={active.workspace}
          channel={active.channel}
          source={demoSource}
          streamEnabled={streamEnabled}
          onToggleStream={toggleStream}
        />
      ) : <p className="empty-state">Open a deal to start editing.</p>}
    </main>
  );
}
