/**
 * Development-only tooling, loaded by `main.tsx` in dev builds only, so none
 * of it reaches the production bundle.
 *
 * - Redux DevTools (browser extension, when installed): keystone's own
 *   adapter. Every action, nested ones as `parent >>> child`, with the tree's
 *   snapshot after it, and time travel. The tabs and the shared options are
 *   two instances.
 * - `?debug` in the URL: each outermost action, logged to the console.
 */
import { connectReduxDevTools, onActionMiddleware } from "mobx-keystone";
import { type DevtoolsMessage, connectExtension, isDebugEnabled } from "@shared/reduxDevtools.ts";
import { multiTabStore } from "./stores/multiTabStore.ts";
import { optionsStore } from "./stores/optionsStore.ts";

// the adapter takes the `remotedev` package only to read the state out of a
// monitor message; the extension's own connection does the rest
const remotedev = { extractState: (message: DevtoolsMessage) => JSON.parse(message.state ?? "null") };

const connectTree = (name: string, tree: object) => {
  const connection = connectExtension(name);
  if (connection) connectReduxDevTools(remotedev, connection, tree);
  if (isDebugEnabled) {
    onActionMiddleware(tree, {
      onFinish: ({ actionName, targetPath, args }) => console.log(`[${name}] [/${targetPath.join("/")}] ${actionName}`, ...args),
    });
  }
};

connectTree("Deal editor (MobX Keystone)", multiTabStore);
connectTree("Options (MobX Keystone)", optionsStore);
