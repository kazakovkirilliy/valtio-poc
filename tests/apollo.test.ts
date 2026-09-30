import { ApolloClient, ApolloLink, InMemoryCache, gql, type TypedDocumentNode } from "@apollo/client";
import { Observable, type Subscriber } from "rxjs";
import { GraphQLError } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { createApolloGateway, saveWorkspaceDraft } from "../src/data/apolloGateway.ts";
import { createWorkspace, type WorkspaceSnapshot } from "../src/state/workspace.ts";
import { createLiveValue } from "../src/state/liveValue.ts";
import { manualFrames } from "./helpers.ts";

type DocumentData = { workspace: WorkspaceSnapshot };
type LiveData = { live: { value: number } };
const load: TypedDocumentNode<DocumentData, { id: string }> = gql`query LoadWorkspace($id: ID!) { workspace(id: $id) { version id baseCode quoteCode isInternal rows { id level } } }`;
const save: TypedDocumentNode<DocumentData, { input: WorkspaceSnapshot }> = gql`mutation SaveWorkspace($input: WorkspaceInput!) { workspace: saveWorkspace(input: $input) { version id baseCode quoteCode isInternal rows { id level } } }`;
const live: TypedDocumentNode<LiveData, { id: string }> = gql`subscription LiveWorkspace($id: ID!) { live(id: $id) { value } }`;

function fixture() {
  const initial = createWorkspace().toSnapshot();
  let liveObserver!: Subscriber<ApolloLink.Result>;
  let response = initial;
  let failLoad = false;
  const stopped = vi.fn();
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new ApolloLink((operation) => new Observable((observer) => {
    if (operation.operationName === "LiveWorkspace") { liveObserver = observer; return stopped; }
    if (operation.operationName === "LoadWorkspace" && failLoad) observer.next({ errors: [new GraphQLError("Unavailable")] });
    else observer.next({ data: { workspace: operation.operationName === "SaveWorkspace" ? operation.variables.input : response } });
    observer.complete();
  })) });
  const gateway = createApolloGateway(client, {
    load: { document: load, variables: (id: string) => ({ id }), read: (data) => data.workspace },
    save: { document: save, variables: (input: WorkspaceSnapshot) => ({ input }), read: (data) => data.workspace },
    live: { document: live, variables: (id: string) => ({ id }), read: (data) => data.live.value },
  });
  return { initial, client, gateway, stopped, setResponse: (snapshot: WorkspaceSnapshot) => { response = snapshot; }, fail: () => { failLoad = true; }, emit: (result: ApolloLink.Result) => liveObserver.next(result) };
}

describe("Apollo boundary", () => {
  it("loads a detached draft, writes mutations through Apollo, and preserves later local edits", async () => {
    const f = fixture();
    const workspace = createWorkspace(await f.gateway.load(f.initial.id));
    workspace.store.set(workspace.baseCode.value, "LOCAL");
    const saved = await saveWorkspaceDraft(workspace, f.gateway.save);
    expect(saved.baseCode).toBe("LOCAL");
    expect(workspace.store.get(workspace.dirty)).toBe(false);
    f.setResponse({ ...f.initial, baseCode: "REMOTE" });
    await f.gateway.load(f.initial.id);
    expect(workspace.toSnapshot().baseCode).toBe("LOCAL");
    f.client.stop();
  });

  it("keeps high-rate live values out of the normalized cache and draft graph", () => {
    const f = fixture();
    const before = f.client.cache.extract();
    const frames = manualFrames();
    const channel = createLiveValue(frames.scheduler);
    const listener = vi.fn();
    const stopChannel = channel.subscribe(listener);
    const onError = vi.fn();
    const stopSource = f.gateway.liveSource(f.initial.id)(channel.publish, onError);
    for (let value = 1; value <= 10_000; value++) f.emit({ data: { live: { value } } });
    expect(frames.size()).toBe(1);
    frames.flush();
    expect(channel.getSnapshot()).toBe(10_000);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(f.client.cache.extract()).toEqual(before);
    expect(onError).not.toHaveBeenCalled();
    stopSource(); stopChannel();
    expect(f.stopped).toHaveBeenCalledTimes(1);
    f.client.stop();
  });

  it("handles GraphQL errors from subscription next results and can receive later data", () => {
    const f = fixture();
    const next = vi.fn();
    const onError = vi.fn();
    const stop = f.gateway.liveSource(f.initial.id)(next, onError);
    f.emit({ errors: [new GraphQLError("Unavailable")] });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    f.emit({ data: { live: { value: 42 } } });
    expect(next).toHaveBeenCalledWith(42);
    stop(); f.client.stop();
  });

  it("rejects query errors and mismatched response identities", async () => {
    const f = fixture();
    f.setResponse({ ...f.initial, id: "wrong" });
    await expect(f.gateway.load(f.initial.id)).rejects.toThrow("ID");
    f.fail();
    await expect(f.gateway.load(f.initial.id)).rejects.toThrow("Unavailable");
    f.client.stop();
  });
});
