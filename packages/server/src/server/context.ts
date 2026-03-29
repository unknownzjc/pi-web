import type { AgentRuntime } from "../runtime/agent-runtime.js";
import type { StateStore } from "../state/state-store.js";
import type { WorkspaceService } from "../services/workspace-service.js";
import type { SessionService } from "../services/session-service.js";
import type { GitService } from "../services/git-service.js";
import type { SubscriptionService } from "../services/subscription-service.js";
import type { FilesystemService } from "../services/filesystem-service.js";

export interface AppDeps {
  runtime: AgentRuntime;
  store: StateStore;
  workspaceService: WorkspaceService;
  sessionService: SessionService;
  gitService: GitService;
  subscriptionService: SubscriptionService;
  filesystemService: FilesystemService;
}
