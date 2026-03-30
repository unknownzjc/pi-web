import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { createApp } from "./server/app.js";
import type { AppDeps } from "./server/context.js";
import type { WsClient } from "./services/subscription-service.js";
import { LocalRuntimeAdapter } from "./runtime/local-runtime-adapter.js";
import { StateStore } from "./state/state-store.js";
import { WorkspaceService } from "./services/workspace-service.js";
import { SessionService } from "./services/session-service.js";
import { GitService } from "./services/git-service.js";
import { SubscriptionService } from "./services/subscription-service.js";
import { FilesystemService } from "./services/filesystem-service.js";

const PI_WEB_DIR = join(homedir(), ".pi-web");
const STATE_PATH = join(PI_WEB_DIR, "state.json");

mkdirSync(PI_WEB_DIR, { recursive: true });

const store = StateStore.readFromFile(STATE_PATH);
const runtime = new LocalRuntimeAdapter();

const workspaceService = new WorkspaceService(store, runtime);
const filesystemService = new FilesystemService();

const subscriptionService = new SubscriptionService({
  onPrompt: async (handle, text) => {
    await sessionService.prompt(handle, text);
  },
  onAbort: async (handle) => {
    await sessionService.abort(handle);
  },
  onListModels: async (handle) => {
    return sessionService.listModels(handle);
  },
  onGetState: async (handle) => {
    return sessionService.getSessionState(handle);
  },
  onSetModel: async (handle, provider, modelId) => {
    await sessionService.setModel(handle, provider, modelId);
  },
  onSetThinkingLevel: async (handle, level) => {
    await sessionService.setThinkingLevel(handle, level);
  },
});

const sessionService = new SessionService(store, runtime, workspaceService);
const gitService = new GitService(runtime, workspaceService);

// Forward runtime events to subscription service
runtime.subscribe((event) => {
  subscriptionService.broadcastEvent(event);
});

const deps: AppDeps = {
  runtime,
  store,
  workspaceService,
  sessionService,
  gitService,
  subscriptionService,
  filesystemService,
};

const app = createApp(deps);

// WebSocket upgrade
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get(
  "/ws",
  upgradeWebSocket(() => {
    let client: WsClient | null = null;
    return {
      onOpen(_event, ws) {
        client = {
          send: (data: string) => ws.send(data),
          close: () => ws.close(),
          get readyState() {
            return ws.readyState;
          },
        };
        deps.subscriptionService.addConnection(client);
      },
      onMessage(event) {
        if (typeof event.data === "string") {
          deps.subscriptionService
            .handleClientMessage(event.data, client ?? undefined)
            .catch((err) => {
              console.error("WS message handler error:", err);
            });
        }
      },
      onClose() {
        if (client) {
          deps.subscriptionService.removeConnection(client);
          client = null;
        }
      },
    };
  }),
);

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(
    `Pi Web Workbench listening on http://${info.address}:${info.port}`,
  );
});
injectWebSocket(server);
