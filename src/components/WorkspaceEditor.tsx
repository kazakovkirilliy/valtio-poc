import { memo } from "react";
import { Provider } from "jotai/react";
import type { Workspace } from "../state/workspace.ts";
import type { LiveSource, LiveValue } from "../state/liveValue.ts";
import { DealColumn } from "./DealColumn.tsx";
import { ProductColumns } from "./ProductColumns.tsx";

type Props = {
  workspace: Workspace;
  channel: LiveValue;
  source: LiveSource;
  streamEnabled: boolean;
  onToggleStream(): void;
};
export const WorkspaceEditor = memo(function WorkspaceEditor({ workspace, channel, source, streamEnabled, onToggleStream }: Props) {
  return (
    <Provider store={workspace.store}>
      <section className="deal" aria-label="Active deal">
        <div className="deal__header">
          <button className="button" onClick={() => workspace.actions.addRows()}>Add New Product</button>
          <button className="button" aria-pressed={streamEnabled} onClick={onToggleStream}>
            Toggle Spot Price Stream ({streamEnabled ? "Enabled" : "Disabled"})
          </button>
          <button className="button quiet" onClick={() => workspace.actions.addRows(1_000)}>Add 1,000 Products</button>
        </div>
        <ProductColumns
          workspace={workspace}
          dealColumn={<DealColumn workspace={workspace} channel={channel} source={source} streamEnabled={streamEnabled} />}
        />
      </section>
    </Provider>
  );
});
