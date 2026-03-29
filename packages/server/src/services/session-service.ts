import type { AgentRuntime } from "../runtime/agent-runtime.js";
import type {
  ListSessionsResult,
  CreateSessionResult,
  ResumeSessionResult,
  SessionStateDto,
  SessionMessagesPageDto,
  ModelDto,
} from "../runtime/runtime-types.js";
import { StateStore } from "../state/state-store.js";
import { WorkspaceService } from "./workspace-service.js";

export class SessionService {
  constructor(
    private store: StateStore,
    private runtime: AgentRuntime,
    private workspaceService: WorkspaceService,
  ) {}

  async listSessions(
    workspaceId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<ListSessionsResult> {
    const ws = this.workspaceService.findById(workspaceId);
    return this.runtime.listSessions({
      workspacePath: ws.path,
      cursor,
      limit,
    });
  }

  async createSession(
    workspaceId: string,
    name?: string,
  ): Promise<CreateSessionResult> {
    const ws = this.workspaceService.findById(workspaceId);
    const result = await this.runtime.createSession({
      workspacePath: ws.path,
      name,
    });

    this.store.updateLastUsed(workspaceId);
    return result;
  }

  async resumeSession(
    _workspaceId: string,
    sessionHandle: string,
  ): Promise<ResumeSessionResult> {
    return this.runtime.resumeSession({ sessionHandle });
  }

  async getSessionState(sessionHandle: string): Promise<SessionStateDto> {
    return this.runtime.getSessionState({ sessionHandle });
  }

  async getSessionMessages(
    sessionHandle: string,
    beforeEntryId?: string,
    limit: number = 20,
  ): Promise<SessionMessagesPageDto> {
    return this.runtime.getSessionMessages({
      sessionHandle,
      beforeEntryId,
      limit,
    });
  }

  async prompt(sessionHandle: string, text: string): Promise<void> {
    return this.runtime.prompt({ sessionHandle, text });
  }

  async abort(sessionHandle: string): Promise<void> {
    return this.runtime.abort({ sessionHandle });
  }

  async listModels(sessionHandle: string): Promise<ModelDto[]> {
    return this.runtime.listModels({ sessionHandle });
  }

  async setModel(sessionHandle: string, provider: string, modelId: string): Promise<void> {
    return this.runtime.setModel({ sessionHandle, provider, modelId });
  }

  async setThinkingLevel(sessionHandle: string, level: string): Promise<void> {
    return this.runtime.setThinkingLevel({
      sessionHandle,
      level: level as any,
    });
  }
}
