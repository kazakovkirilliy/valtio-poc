/**
 * Development-only tooling, loaded by `main.tsx` in dev builds only, so none
 * of it reaches the production bundle.
 *
 * - Redux DevTools (browser extension, when installed): every action, with
 *   the tree's snapshot after it, and time travel (jumping applies that
 *   snapshot). The tabs and the shared options are two instances.
 * - `?debug` in the URL: the same actions, logged to the console.
 */
import { type IAnyStateTreeNode, applySnapshot, getSnapshot, onAction } from "mobx-state-tree";
import { createActionLog } from "@shared/reduxDevtools.ts";
import { multiTabStore } from "./stores/multiTabStore.ts";
import { optionsStore } from "./stores/optionsStore.ts";

const connectTree = (name: string, tree: IAnyStateTreeNode) => {
  const report = createActionLog({
    name,
    getState: () => getSnapshot(tree),
    applyState: (snapshot) => applySnapshot(tree, snapshot),
  });
  // only outermost actions are reported; `true`: after they've run
  onAction(tree, ({ name, path, args }) => report(`[${path || "/"}] ${name}`, args ?? []), true);
};

connectTree("Deal editor (MobX-State-Tree)", multiTabStore);
connectTree("Options (MobX-State-Tree)", optionsStore);
