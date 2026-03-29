import { Hono } from "hono";
import type { AgentRuntime } from "../runtime/agent-runtime.js";
import type { AppDeps } from "../server/context.js";
import { createApp } from "../server/app.js";
import { StateStore } from "../state/state-store.js";
import { WorkspaceService } from "../services/workspace-service.js";
import { SessionService } from "../services/session-service.js";
import { GitService } from "../services/git-service.js";
import { SubscriptionService } from "../services/subscription-service.js";
import { FilesystemService } from "../services/filesystem-service.js";

export function createTestApp(runtime: AgentRuntime): Hono {
  const store = new StateStore();
  const workspaceService = new WorkspaceService(store, runtime);
  const sessionService = new SessionService(store, runtime, workspaceService);
  const gitService = new GitService(runtime, workspaceService);
  const subscriptionService = new SubscriptionService({
    onPrompt: () => Promise.resolve(),
    onAbort: () => Promise.resolve(),
    onListModels: () => Promise.resolve([]),
    onGetState: () => Promise.resolve({ sessionHandle: "", isStreaming: false, pendingToolCalls: [] }),
    onSetModel: () => Promise.resolve(),
    onSetThinkingLevel: () => Promise.resolve(),
  });
  const filesystemService = new FilesystemService();

  const deps: AppDeps = {
    runtime,
    store,
    workspaceService,
    sessionService,
    gitService,
    subscriptionService,
    filesystemService,
  };

  return createApp(deps);
}
