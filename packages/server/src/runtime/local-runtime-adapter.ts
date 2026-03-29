import {
  existsSync,
  accessSync,
  constants,
} from "node:fs";
import { join } from "node:path";
import {
  createAgentSession,
  SessionManager,
  ModelRegistry,
  AuthStorage,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { AgentRuntime } from "./agent-runtime.js";
import type {
  WorkspaceValidationResult,
  ListSessionsInput,
  ListSessionsResult,
  CreateSessionInput,
  CreateSessionResult,
  ResumeSessionInput,
  ResumeSessionResult,
  GetSessionStateInput,
  SessionStateDto,
  GetSessionMessagesInput,
  SessionMessagesPageDto,
  PromptInput,
  AbortInput,
  GetGitChangesInput,
  GitChangesDto,
  GetGitDiffInput,
  GitDiffDto,
  RuntimeEvent,
  RuntimeEventListener,
  SessionSummaryDto,
  ListModelsInput,
  ModelDto,
  SetModelInput,
  SetThinkingLevelInput,
  ThinkingLevel,
} from "./runtime-types.js";
import { SessionLifecycle } from "./session-lifecycle.js";
import {
  translateEvent,
  createTranslatorState,
  agentMessageToDto,
} from "./event-translator.js";

export class LocalRuntimeAdapter implements AgentRuntime {
  readonly runtimeId = "local";

  /** Index: sessionId → sessionFilePath (full path to .jsonl) */
  private sessionIndex = new Map<string, string>();

  /** Index: sessionId → workspacePath (needed for reactivating sessions) */
  private workspaceIndex = new Map<string, string>();

  /** Active agent sessions managed by the SDK. */
  private lifecycle = new SessionLifecycle();

  /** Registered runtime event listeners. */
  private listeners = new Set<RuntimeEventListener>();

  /** Shared model registry — available before any session is activated. */
  private modelRegistry = new ModelRegistry(AuthStorage.create());

  /** Settings manager — reads user defaults (default provider/model/thinking level). */
  private settingsManager = SettingsManager.create();

  async validateWorkspace(inputPath: string): Promise<WorkspaceValidationResult> {
    const isDirectory = existsSync(inputPath);
    let isWritable = false;
    let isGitRepo = false;

    if (isDirectory) {
      try {
        accessSync(inputPath, constants.W_OK);
        isWritable = true;
      } catch {
        isWritable = false;
      }
      isGitRepo = existsSync(join(inputPath, ".git"));
    }

    return {
      normalizedPath: inputPath,
      isDirectory,
      isWritable,
      isGitRepo,
    };
  }

  async listSessions(input: ListSessionsInput): Promise<ListSessionsResult> {
    const sessions: SessionSummaryDto[] = [];

    try {
      const sessionInfos = await SessionManager.list(input.workspacePath);

      for (const info of sessionInfos) {
        sessions.push({
          sessionHandle: `local:${info.id}`,
          sessionId: info.id,
          runtimeId: this.runtimeId,
          workspacePath: input.workspacePath,
          sessionFile: info.path,
          sessionName: info.name,
          createdAt: info.created.toISOString(),
          updatedAt: info.modified.toISOString(),
          lastMessagePreview:
            info.firstMessage.length > 100
              ? info.firstMessage.slice(0, 100) + "…"
              : info.firstMessage || undefined,
        });

        // Index the session
        this.sessionIndex.set(info.id, info.path);
        this.workspaceIndex.set(info.id, input.workspacePath);
      }
    } catch {
      // SessionManager.list may fail if session dir doesn't exist yet
    }

    // Sort by updatedAt desc
    sessions.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    // Apply pagination
    let startIndex = 0;
    if (input.cursor) {
      const decoded = JSON.parse(
        Buffer.from(input.cursor, "base64url").toString("utf-8"),
      );
      const cursorIdx = sessions.findIndex(
        (s) => s.sessionId === decoded.sessionId,
      );
      if (cursorIdx >= 0) {
        startIndex = cursorIdx + 1;
      }
    }

    const page = sessions.slice(startIndex, startIndex + input.limit);
    const hasMore = startIndex + input.limit < sessions.length;
    let nextCursor: string | undefined;

    if (hasMore && page.length > 0) {
      const lastItem = page[page.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ sessionId: lastItem.sessionId }),
      ).toString("base64url");
    }

    return { items: page, nextCursor };
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    // Create the session via SDK — it handles persistence automatically
    const sessionManager = SessionManager.create(input.workspacePath);
    sessionManager.newSession();

    const sessionId = sessionManager.getSessionId();
    const sessionFile = sessionManager.getSessionFile();

    // If a name was provided, record it in the session
    if (input.name) {
      sessionManager.appendSessionInfo(input.name);
    }

    const now = new Date().toISOString();

    const session: SessionSummaryDto = {
      sessionHandle: `local:${sessionId}`,
      sessionId,
      runtimeId: this.runtimeId,
      workspacePath: input.workspacePath,
      sessionFile: sessionFile ?? undefined,
      sessionName: input.name,
      createdAt: now,
      updatedAt: now,
    };

    // Index the session
    if (sessionFile) {
      this.sessionIndex.set(sessionId, sessionFile);
    }
    this.workspaceIndex.set(sessionId, input.workspacePath);

    return { session };
  }

  async resumeSession(
    input: ResumeSessionInput,
  ): Promise<ResumeSessionResult> {
    const { sessionId } = this.parseHandle(input.sessionHandle);
    const sessionPath = this.sessionIndex.get(sessionId);
    if (!sessionPath) throw new Error("session_not_found");

    const session = this.buildSummaryFromPath(
      sessionId,
      sessionPath,
    );
    return { session };
  }

  async getSessionState(input: GetSessionStateInput): Promise<SessionStateDto> {
    const { sessionId } = this.parseHandle(input.sessionHandle);
    const active = this.lifecycle.get(sessionId);
    if (active) {
      const session = active.agentSession;
      const model = session.model;
      const modelRegistry = session.modelRegistry;
      const availableModels: ModelDto[] = modelRegistry
        ? modelRegistry.getAvailable().map((m: any) => ({
            provider: m.provider ?? "unknown",
            id: m.id ?? "unknown",
            name: m.name ?? m.id ?? "unknown",
            reasoning: m.reasoning ?? false,
            contextWindow: m.contextWindow ?? 0,
            maxTokens: m.maxTokens ?? 0,
          }))
        : [];
      const availableThinkingLevels: ThinkingLevel[] =
        session.getAvailableThinkingLevels?.() ?? [];
      return {
        sessionHandle: input.sessionHandle,
        model: model
          ? {
              provider: (model as any).provider ?? "unknown",
              id: (model as any).id ?? "unknown",
              displayName: (model as any).name ?? (model as any).id,
            }
          : undefined,
        thinkingLevel: session.thinkingLevel ?? undefined,
        availableModels,
        availableThinkingLevels,
        isStreaming: session.isStreaming,
        pendingToolCalls: [],
      };
    }
    // For persisted (inactive) sessions, return static state with shared model list
    // and a default model/thinking level so the UI can show selectors immediately.
    const sharedModels: ModelDto[] = this.modelRegistry
      .getAvailable()
      .map((m: any) => ({
        provider: m.provider ?? "unknown",
        id: m.id ?? "unknown",
        name: m.name ?? m.id ?? "unknown",
        reasoning: m.reasoning ?? false,
        contextWindow: m.contextWindow ?? 0,
        maxTokens: m.maxTokens ?? 0,
      }));

    // Resolve default model from settings (matching pi coding agent behavior)
    const defaultProvider = this.settingsManager.getDefaultProvider();
    const defaultModelId = this.settingsManager.getDefaultModel();
    const defaultThinkingLevel = this.settingsManager.getDefaultThinkingLevel();

    let defaultModel: ModelDto | undefined;
    if (defaultProvider && defaultModelId) {
      // Find the configured default model in the available list
      defaultModel = sharedModels.find(
        (m) => m.provider === defaultProvider && m.id === defaultModelId,
      );
    }
    // Fallback to first available model
    if (!defaultModel) {
      defaultModel = sharedModels[0];
    }

    const isReasoning = defaultModel?.reasoning ?? false;
    const allThinkingLevels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

    return {
      sessionHandle: input.sessionHandle,
      model: defaultModel
        ? {
            provider: defaultModel.provider,
            id: defaultModel.id,
            displayName: defaultModel.name,
          }
        : undefined,
      thinkingLevel: defaultThinkingLevel ?? (isReasoning ? "medium" : "off"),
      availableModels: sharedModels,
      availableThinkingLevels: isReasoning ? allThinkingLevels : ["off"],
      isStreaming: false,
      pendingToolCalls: [],
    };
  }

  async getSessionMessages(
    input: GetSessionMessagesInput,
  ): Promise<SessionMessagesPageDto> {
    const { sessionId } = this.parseHandle(input.sessionHandle);
    const active = this.lifecycle.get(sessionId);
    if (active) {
      const messages = active.agentSession.messages;
      const items = messages.map((msg: any) => agentMessageToDto(msg));
      return {
        sessionHandle: input.sessionHandle,
        items,
      };
    }

    // For persisted (inactive) sessions, load from SDK's .jsonl file
    const sessionPath = this.sessionIndex.get(sessionId);
    if (sessionPath && existsSync(sessionPath)) {
      try {
        const sm = SessionManager.open(sessionPath);
        const entries = sm.getEntries();
        const items = entries
          .filter((e: any) => e.type === "message")
          .map((e: any) => agentMessageToDto(e.message));
        return {
          sessionHandle: input.sessionHandle,
          items,
        };
      } catch (err) {
        console.error(`[runtime] Failed to load messages for session ${sessionId}:`, err);
      }
    }

    return {
      sessionHandle: input.sessionHandle,
      items: [],
    };
  }

  async prompt(input: PromptInput): Promise<void> {
    const { sessionId } = this.parseHandle(input.sessionHandle);
    const sessionPath = this.sessionIndex.get(sessionId);

    let active = this.lifecycle.get(sessionId);
    if (!active) {
      active = await this.createActiveSession(
        sessionId,
        input.sessionHandle,
        sessionPath,
      );
    }

    // Fire-and-forget: don't await SDK prompt so WS handler can return quickly
    active.agentSession.prompt(input.text).catch((err) => {
      this.emit({
        type: "session.error",
        sessionHandle: input.sessionHandle,
        error: {
          code: "agent_error",
          message: String(err?.message ?? err),
        },
      });
      this.emit({
        type: "session.state",
        sessionHandle: input.sessionHandle,
        state: {
          sessionHandle: input.sessionHandle,
          isStreaming: false,
          pendingToolCalls: [],
        },
      });
    });
  }

  async abort(input: AbortInput): Promise<void> {
    const { sessionId } = this.parseHandle(input.sessionHandle);
    const active = this.lifecycle.get(sessionId);
    if (active) {
      await active.agentSession.abort();
    }
  }

  async getGitChanges(_input: GetGitChangesInput): Promise<GitChangesDto> {
    // Will be implemented with GitService
    throw new Error("Not implemented");
  }

  async getGitDiff(_input: GetGitDiffInput): Promise<GitDiffDto> {
    // Will be implemented with GitService
    throw new Error("Not implemented");
  }

  async listModels(input: ListModelsInput): Promise<ModelDto[]> {
    const { sessionId } = this.parseHandle(input.sessionHandle);
    const active = this.lifecycle.get(sessionId);
    // Use session's model registry if available, otherwise fall back to shared registry
    const modelRegistry = active?.agentSession.modelRegistry ?? this.modelRegistry;
    if (!modelRegistry) return [];
    const models = modelRegistry.getAvailable();
    return models.map((m: any) => ({
      provider: m.provider ?? "unknown",
      id: m.id ?? "unknown",
      name: m.name ?? m.id ?? "unknown",
      reasoning: m.reasoning ?? false,
      contextWindow: m.contextWindow ?? 0,
      maxTokens: m.maxTokens ?? 0,
    }));
  }

  async setModel(input: SetModelInput): Promise<void> {
    const { sessionId } = this.parseHandle(input.sessionHandle);
    const sessionPath = this.sessionIndex.get(sessionId);

    let active = this.lifecycle.get(sessionId);
    if (!active) {
      active = await this.createActiveSession(
        sessionId,
        input.sessionHandle,
        sessionPath,
      );
    }

    const modelRegistry = active.agentSession.modelRegistry ?? this.modelRegistry;
    const model = modelRegistry.find(input.provider, input.modelId);
    if (!model) throw new Error("model_not_found");

    await active.agentSession.setModel(model);

    // Broadcast updated state
    this.emitState(sessionId, input.sessionHandle);
  }

  async setThinkingLevel(input: SetThinkingLevelInput): Promise<void> {
    const { sessionId } = this.parseHandle(input.sessionHandle);
    const sessionPath = this.sessionIndex.get(sessionId);

    let active = this.lifecycle.get(sessionId);
    if (!active) {
      active = await this.createActiveSession(
        sessionId,
        input.sessionHandle,
        sessionPath,
      );
    }

    active.agentSession.setThinkingLevel(input.level);

    // Broadcast updated state
    this.emitState(sessionId, input.sessionHandle);
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private emitState(sessionId: string, sessionHandle: string): void {
    const active = this.lifecycle.get(sessionId);
    if (!active) return;
    const session = active.agentSession;
    const model = session.model;
    const modelRegistry = session.modelRegistry;
    const availableModels: ModelDto[] = modelRegistry
      ? modelRegistry.getAvailable().map((m: any) => ({
          provider: m.provider ?? "unknown",
          id: m.id ?? "unknown",
          name: m.name ?? m.id ?? "unknown",
          reasoning: m.reasoning ?? false,
          contextWindow: m.contextWindow ?? 0,
          maxTokens: m.maxTokens ?? 0,
        }))
      : [];
    const availableThinkingLevels: ThinkingLevel[] =
      session.getAvailableThinkingLevels?.() ?? [];
    this.emit({
      type: "session.state",
      sessionHandle,
      state: {
        sessionHandle,
        model: model
          ? {
              provider: (model as any).provider ?? "unknown",
              id: (model as any).id ?? "unknown",
              displayName: (model as any).name ?? (model as any).id,
            }
          : undefined,
        thinkingLevel: session.thinkingLevel ?? undefined,
        availableModels,
        availableThinkingLevels,
        isStreaming: session.isStreaming,
        pendingToolCalls: [],
      },
    });
  }

  private async createActiveSession(
    sessionId: string,
    sessionHandle: string,
    sessionFilePath: string | undefined,
  ) {
    const workspacePath = this.workspaceIndex.get(sessionId);
    // Reopen the existing SDK session if we have a path, otherwise create new
    let sessionManager: SessionManager;
    if (sessionFilePath && existsSync(sessionFilePath)) {
      sessionManager = SessionManager.open(sessionFilePath);
    } else if (workspacePath) {
      // Create new session under the correct workspace so .pi/agent/sessions
      // uses the standard path-based naming convention (e.g. --Users-...-pi-web--)
      sessionManager = SessionManager.create(workspacePath);
      sessionManager.newSession({ id: sessionId });
    } else {
      sessionManager = SessionManager.create(process.cwd());
      sessionManager.newSession({ id: sessionId });
    }

    const { session: agentSession } = await createAgentSession({
      sessionManager,
    });

    // Update index with the actual session file path
    const actualFile = agentSession.sessionFile;
    if (actualFile) {
      this.sessionIndex.set(agentSession.sessionId, actualFile);
    }

    const translatorState = createTranslatorState();

    const unsubscribeFromSdk = agentSession.subscribe((event) => {
      const runtimeEvents = translateEvent(
        event,
        translatorState,
        sessionHandle,
        () => undefined,
      );

      for (const re of runtimeEvents) {
        this.emit(re);
      }

      // Emit state updates on agent lifecycle transitions
      if (event.type === "agent_start") {
        this.emit({
          type: "session.state",
          sessionHandle,
          state: {
            sessionHandle,
            isStreaming: true,
            pendingToolCalls: [],
          },
        });
      } else if (event.type === "agent_end") {
        this.emit({
          type: "session.state",
          sessionHandle,
          state: {
            sessionHandle,
            isStreaming: false,
            pendingToolCalls: [],
          },
        });
      }
    });

    const active = {
      agentSession,
      sessionId,
      sessionHandle,
      workspacePath: sessionManager.getCwd(),
      unsubscribeFromSdk,
      translatorState,
    };

    this.lifecycle.add(active);
    this.emit({ type: "session.started", sessionHandle });

    return active;
  }

  private parseHandle(handle: string): { sessionId: string } {
    if (!handle.startsWith("local:")) {
      throw new Error("session_not_found");
    }
    return { sessionId: handle.slice("local:".length) };
  }

  private buildSummaryFromPath(
    sessionId: string,
    sessionFilePath: string,
  ): SessionSummaryDto {
    try {
      const sm = SessionManager.open(sessionFilePath);
      const header = sm.getHeader();
      const cwd = sm.getCwd();

      return {
        sessionHandle: `local:${sessionId}`,
        sessionId,
        runtimeId: this.runtimeId,
        workspacePath: cwd,
        sessionFile: sessionFilePath,
        sessionName: sm.getSessionName(),
        createdAt: header?.timestamp ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch {
      throw new Error("session_not_found");
    }
  }
}
