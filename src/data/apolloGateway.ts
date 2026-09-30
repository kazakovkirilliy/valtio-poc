import type { ApolloClient, OperationVariables, TypedDocumentNode } from "@apollo/client";
import { parseWorkspaceSnapshot, type Workspace, type WorkspaceSnapshot } from "../state/workspace.ts";
import type { LiveSource } from "../state/liveValue.ts";

type Operation<Data, Variables extends OperationVariables, Input, Output> = {
  document: TypedDocumentNode<Data, Variables>;
  variables(input: Input): Variables;
  read(data: Data): Output;
};

/** Generated operations and mappings are supplied by the host application. */
export function createApolloGateway<
  LoadData, LoadVariables extends OperationVariables,
  SaveData, SaveVariables extends OperationVariables,
  LiveData, LiveVariables extends OperationVariables,
>(client: ApolloClient, operations: {
  load: Operation<LoadData, LoadVariables, string, WorkspaceSnapshot>;
  save: Operation<SaveData, SaveVariables, WorkspaceSnapshot, WorkspaceSnapshot>;
  live: Operation<LiveData, LiveVariables, string, number | undefined>;
}) {
  return {
    async load(id: string) {
      const result = await client.query({
        query: operations.load.document,
        variables: operations.load.variables(id),
        fetchPolicy: "network-only",
        errorPolicy: "none",
      });
      if (!result.data) throw new Error("Workspace response has no data");
      const snapshot = parseWorkspaceSnapshot(operations.load.read(result.data));
      if (snapshot.id !== id) throw new Error("Workspace response ID does not match the request");
      return snapshot;
    },
    async save(snapshot: WorkspaceSnapshot) {
      const input = parseWorkspaceSnapshot(snapshot);
      const result = await client.mutate({
        mutation: operations.save.document,
        variables: operations.save.variables(input),
        errorPolicy: "none",
      });
      if (!result.data) throw new Error("Save response has no data");
      const saved = parseWorkspaceSnapshot(operations.save.read(result.data));
      if (saved.id !== input.id) throw new Error("Save response ID does not match the request");
      return saved;
    },
    liveSource(id: string): LiveSource {
      return (next, onError) => {
        // Display-only values bypass normalized-cache writes and watcher fan-out.
        const subscription = client.subscribe({
          query: operations.live.document,
          variables: operations.live.variables(id),
          fetchPolicy: "no-cache",
          errorPolicy: "none",
        }).subscribe({
          next(result) {
            if (result.error) { onError(result.error); return; }
            if (!result.data) return;
            try {
              const value = operations.live.read(result.data);
              if (value !== undefined) next(value);
            } catch (error) {
              onError(error instanceof Error ? error : new Error(String(error)));
            }
          },
          error: onError,
          complete: () => onError(new Error("Live stream ended")),
        });
        return () => subscription.unsubscribe();
      };
    },
  };
}

/** Acknowledgement cannot discard edits made while a save is in flight. */
const saving = new WeakSet<Workspace>();
export async function saveWorkspaceDraft(
  workspace: Workspace,
  save: (snapshot: WorkspaceSnapshot) => Promise<WorkspaceSnapshot>,
) {
  if (saving.has(workspace)) throw new Error("A save is already in progress for this workspace");
  if (workspace.store.get(workspace.errorCount)) throw new Error("Fix validation errors before saving");
  const revision = workspace.store.get(workspace.revision);
  const submitted = workspace.toSnapshot();
  saving.add(workspace);
  try {
    const result = parseWorkspaceSnapshot(await save(submitted));
    if (result.id !== workspace.id) throw new Error("Save response ID does not match the request");
    // Canonicalization requires deliberate reconciliation by the caller.
    if (JSON.stringify(result) === JSON.stringify(submitted)) workspace.actions.acknowledgeSave(revision);
    return result;
  } finally {
    saving.delete(workspace);
  }
}
