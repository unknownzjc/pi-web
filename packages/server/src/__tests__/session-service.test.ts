import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentRuntime } from "../runtime/agent-runtime.js";
import type {
  ListSessionsResult,
  CreateSessionResult,
  ResumeSessionResult,
  SessionStateDto,
  SessionMessagesPageDto,
} from "../runtime/runtime-types.js";
import { SessionService } from "../services/session-service.js";
import { WorkspaceService } from "../services/workspace-service.js";
import { StateStore } from "../state/state-store.js";

function createMockRuntime(): AgentRuntime {
  return {
    runtimeId: "local",
    validateWorkspace: vi.fn().mockResolvedValue({
      normalizedPath: "/tmp/proj",
      isDirectory: true,
      isWritable: true,
      isGitRepo: true,
    }),
    listSessions: vi.fn().mockResolvedValue({ items: [], nextCursor: undefined } satisfies ListSessionsResult),
    createSession: vi
      .fn()
      .mockResolvedValue({ session: { sessionHandle: "local:sess-1", sessionId: "sess-1", runtimeId: "local", workspacePath: "/tmp/proj", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" } } satisfies CreateSessionResult),
    resumeSession: vi
      .fn()
      .mockResolvedValue({ session: { sessionHandle: "local:sess-1", sessionId: "sess-1", runtimeId: "local", workspacePath: "/tmp/proj", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" } } satisfies ResumeSessionResult),
    getSessionState: vi.fn().mockResolvedValue({
      sessionHandle: "local:sess-1",
      isStreaming: false,
      pendingToolCalls: [],
    } satisfies SessionStateDto),
    getSessionMessages: vi.fn().mockResolvedValue({
      sessionHandle: "local:sess-1",
      items: [],
    } satisfies SessionMessagesPageDto),
    prompt: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    getGitChanges: vi.fn(),
    getGitDiff: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  } as unknown as AgentRuntime;
}

describe("SessionService", () => {
  let store: StateStore;
  let runtime: AgentRuntime;
  let workspaceService: WorkspaceService;
  let sessionService: SessionService;
  let workspaceId: string;

  beforeEach(async () => {
    store = new StateStore();
    runtime = createMockRuntime();
    workspaceService = new WorkspaceService(store, runtime);
    sessionService = new SessionService(store, runtime, workspaceService);

    const ws = await workspaceService.register({ path: "/tmp/proj" });
    workspaceId = ws.workspaceId;
  });

  it("listSessions delegates to runtime with correct workspacePath", async () => {
    await sessionService.listSessions(workspaceId, undefined, 10);

    expect(runtime.listSessions).toHaveBeenCalledWith({
      workspacePath: "/tmp/proj",
      cursor: undefined,
      limit: 10,
    });
  });

  it("createSession resolves workspace → runtime → creates session", async () => {
    const result = await sessionService.createSession(workspaceId, "My Session");

    expect(runtime.createSession).toHaveBeenCalledWith({
      workspacePath: "/tmp/proj",
      name: "My Session",
    });
    expect(result.session.sessionHandle).toBe("local:sess-1");
  });

  it("createSession updates workspace lastUsedAt", async () => {
    await sessionService.createSession(workspaceId);
    const ws = workspaceService.findById(workspaceId);
    expect(ws.lastUsedAt).toBeTruthy();
  });

  it("resumeSession resolves handle → runtime.resumeSession", async () => {
    const result = await sessionService.resumeSession(workspaceId, "local:sess-1");

    expect(runtime.resumeSession).toHaveBeenCalledWith({
      sessionHandle: "local:sess-1",
    });
    expect(result.session.sessionHandle).toBe("local:sess-1");
  });

  it("getSessionState returns runtime state", async () => {
    const state = await sessionService.getSessionState("local:sess-1");

    expect(runtime.getSessionState).toHaveBeenCalledWith({
      sessionHandle: "local:sess-1",
    });
    expect(state.isStreaming).toBe(false);
  });

  it("getSessionMessages passes pagination params correctly", async () => {
    await sessionService.getSessionMessages("local:sess-1", "entry-5", 20);

    expect(runtime.getSessionMessages).toHaveBeenCalledWith({
      sessionHandle: "local:sess-1",
      beforeEntryId: "entry-5",
      limit: 20,
    });
  });

  it("prompt resolves handle → runtime.prompt", async () => {
    await sessionService.prompt("local:sess-1", "hello world");

    expect(runtime.prompt).toHaveBeenCalledWith({
      sessionHandle: "local:sess-1",
      text: "hello world",
    });
  });

  it("abort resolves handle → runtime.abort", async () => {
    await sessionService.abort("local:sess-1");

    expect(runtime.abort).toHaveBeenCalledWith({
      sessionHandle: "local:sess-1",
    });
  });

  it("unknown workspaceId throws workspace_not_found", async () => {
    await expect(
      sessionService.listSessions("nonexistent", undefined, 10),
    ).rejects.toThrow("workspace_not_found");
  });

  it("listSessions passes cursor correctly", async () => {
    await sessionService.listSessions(workspaceId, "abc123", 5);

    expect(runtime.listSessions).toHaveBeenCalledWith({
      workspacePath: "/tmp/proj",
      cursor: "abc123",
      limit: 5,
    });
  });
});
