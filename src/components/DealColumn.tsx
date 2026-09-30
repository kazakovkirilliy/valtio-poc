import { memo } from "react";
import { useAtom, useAtomValue } from "jotai/react";
import type { Workspace } from "../state/workspace.ts";
import type { LiveSource, LiveValue } from "../state/liveValue.ts";
import { TextInput } from "./TextInput.tsx";
import { BroadcastInput } from "./BroadcastInput.tsx";
import { LiveValueField } from "./LiveValueField.tsx";

function Status({ workspace }: { workspace: Workspace }) {
  const errorCount = useAtomValue(workspace.errorCount);
  const dirty = useAtomValue(workspace.dirty);
  const products = useAtomValue(workspace.rows);
  return (
    <p className="status" role="status" aria-label="Deal status">
      {products.length.toLocaleString()} {products.length === 1 ? "product" : "products"}
      {" · "}{errorCount ? `${errorCount} invalid fields` : "All fields valid"}
      {" · "}{dirty ? "Unsaved changes" : "Unchanged"}
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

export const DealColumn = memo(function DealColumn({ workspace, channel, source, streamEnabled }: Props) {
  return (
    <section className="column deal-column" aria-label="Deal column">
      <h3>Deal Column</h3>
      <TextInput field={workspace.baseCode} label="Notional Ccy" />
      <TextInput field={workspace.quoteCode} label="Premium Ccy" />
      <BroadcastInput workspace={workspace} />
      <LiveValueField channel={channel} source={source} enabled={streamEnabled} label="Spot Stream" />
      <Mode workspace={workspace} />
      <Status workspace={workspace} />
    </section>
  );
});
