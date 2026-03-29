import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentRuntime } from "../runtime/agent-runtime.js";
import type {
  ListSessionsResult,
  CreateSessionResult,
  ResumeSessionResult,
  SessionStateDto,
  SessionMessagesPageDto,
  GitChangesDto,
  GitDiffDto,
} from "../runtime/runtime-types.js";
import type { ApiResponse } from "../server/errors.js";
import type { WorkspaceEntry } from "../state/state-schema.js";
import { createTestApp } from "./test-helpers.js";

interface WorkspaceData {
  workspaceId: string;
  runtimeId: string;
  path: string;
  name?: string;
  isGitRepo: boolean;
  lastUsedAt?: string;
}

async function jsonBody<T>(res: Response): Promise<ApiResponse<T>> {
  return (await res.json()) as ApiResponse<T>;
}

describe("Routes", () => {
  let runtime: AgentRuntime;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    runtime = createMockRuntime();
    app = createTestApp(runtime);
  });

  // ─── Health ───────────────────────────────────────────

  describe("GET /api/health", () => {
    it("returns ok envelope", async () => {
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      const body = await jsonBody<{ status: string }>(res);
      expect(body.ok).toBe(true);
      if (body.ok) expect(body.data.status).toBe("running");
    });
  });

  // ─── Workspaces ───────────────────────────────────────

  describe("POST /api/workspaces", () => {
    it("creates workspace and returns envelope", async () => {
      const res = await app.request("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/proj", name: "Test" }),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody<WorkspaceData>(res);
      expect(body.ok).toBe(true);
      if (body.ok) {
        expect(body.data.workspaceId).toBeTruthy();
        expect(body.data.path).toBe("/tmp/proj");
      }
    });

    it("returns error envelope for invalid body", async () => {
      const res = await app.request("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody<never>(res);
      expect(body.ok).toBe(false);
      if (!body.ok) expect(body.error.code).toBe("workspace_invalid");
    });

    it("returns error envelope for invalid workspace path", async () => {
      const badRuntime = createMockRuntime({
        validateWorkspace: vi.fn().mockResolvedValue({
          normalizedPath: "/tmp/bad",
          isDirectory: false,
          isWritable: false,
          isGitRepo: false,
        }),
      });
      const badApp = createTestApp(badRuntime);

      const res = await badApp.request("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/bad" }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody<never>(res);
      expect(body.ok).toBe(false);
      if (!body.ok) expect(body.error.code).toBe("workspace_invalid");
    });
  });

  describe("GET /api/workspaces", () => {
    it("returns empty list envelope", async () => {
      const res = await app.request("/api/workspaces");
      expect(res.status).toBe(200);
      const body = await jsonBody<WorkspaceEntry[]>(res);
      expect(body.ok).toBe(true);
      if (body.ok) expect(body.data).toEqual([]);
    });

    it("returns registered workspaces", async () => {
      await app.request("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/proj", name: "Test" }),
      });

      const res = await app.request("/api/workspaces");
      const body = await jsonBody<WorkspaceEntry[]>(res);
      expect(body.ok).toBe(true);
      if (body.ok) expect(body.data).toHaveLength(1);
    });
  });

  describe("DELETE /api/workspaces/:id", () => {
    it("removes workspace and returns ok", async () => {
      const createRes = await app.request("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/proj" }),
      });
      const created = await jsonBody<WorkspaceData>(createRes);
      if (!created.ok) throw new Error("setup failed");

      const delRes = await app.request(
        `/api/workspaces/${created.data.workspaceId}`,
        { method: "DELETE" },
      );
      expect(delRes.status).toBe(200);
      const body = await jsonBody<{ deleted: boolean }>(delRes);
      expect(body.ok).toBe(true);
    });

    it("returns workspace_not_found for unknown id", async () => {
      const res = await app.request("/api/workspaces/nonexistent", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
      const body = await jsonBody<never>(res);
      expect(body.ok).toBe(false);
      if (!body.ok) expect(body.error.code).toBe("workspace_not_found");
    });
  });

  // ─── Sessions ─────────────────────────────────────────

  describe("POST /api/sessions", () => {
    it("creates session and returns envelope", async () => {
      const wsRes = await app.request("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/proj" }),
      });
      const wsBody = await jsonBody<WorkspaceData>(wsRes);
      if (!wsBody.ok) throw new Error("setup failed");

      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: wsBody.data.workspaceId,
          name: "Sess",
        }),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody<CreateSessionResult>(res);
      expect(body.ok).toBe(true);
      if (body.ok) expect(body.data.session).toBeDefined();
    });

    it("returns workspace_not_found for unknown workspaceId", async () => {
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "nonexistent" }),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody<never>(res);
      expect(body.ok).toBe(false);
      if (!body.ok) expect(body.error.code).toBe("workspace_not_found");
    });
  });

  describe("GET /api/workspaces/:id/sessions", () => {
    it("returns sessions list", async () => {
      const wsRes = await app.request("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/proj" }),
      });
      const wsBody = await jsonBody<WorkspaceData>(wsRes);
      if (!wsBody.ok) throw new Error("setup failed");

      const res = await app.request(
        `/api/workspaces/${wsBody.data.workspaceId}/sessions`,
      );
      expect(res.status).toBe(200);
      const body = await jsonBody<ListSessionsResult>(res);
      expect(body.ok).toBe(true);
    });

    it("returns workspace_not_found for unknown id", async () => {
      const res = await app.request("/api/workspaces/nonexistent/sessions");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/sessions/:handle/state", () => {
    it("returns session state", async () => {
      const res = await app.request("/api/sessions/local:sess-1/state");
      expect(res.status).toBe(200);
      const body = await jsonBody<SessionStateDto>(res);
      expect(body.ok).toBe(true);
      if (body.ok) expect(body.data.isStreaming).toBe(false);
    });
  });

  describe("GET /api/sessions/:handle/messages", () => {
    it("returns messages with pagination params", async () => {
      const res = await app.request(
        "/api/sessions/local:sess-1/messages?beforeEntryId=e5&limit=20",
      );
      expect(res.status).toBe(200);
      const body = await jsonBody<SessionMessagesPageDto>(res);
      expect(body.ok).toBe(true);
    });
  });

  describe("POST /api/sessions/:handle/abort", () => {
    it("aborts session", async () => {
      const res = await app.request("/api/sessions/local:sess-1/abort", {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const body = await jsonBody<{ aborted: boolean }>(res);
      expect(body.ok).toBe(true);
    });
  });

  // ─── Git ──────────────────────────────────────────────

  describe("GET /api/workspaces/:id/git/changes", () => {
    it("returns git changes", async () => {
      const wsRes = await app.request("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/proj" }),
      });
      const wsBody = await jsonBody<WorkspaceData>(wsRes);
      if (!wsBody.ok) throw new Error("setup failed");

      const res = await app.request(
        `/api/workspaces/${wsBody.data.workspaceId}/git/changes`,
      );
      expect(res.status).toBe(200);
      const body = await jsonBody<GitChangesDto>(res);
      expect(body.ok).toBe(true);
      if (body.ok) expect(body.data.items).toBeDefined();
    });
  });

  describe("GET /api/workspaces/:id/git/diff", () => {
    it("returns git diff for valid path", async () => {
      const wsRes = await app.request("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/proj" }),
      });
      const wsBody = await jsonBody<WorkspaceData>(wsRes);
      if (!wsBody.ok) throw new Error("setup failed");

      const res = await app.request(
        `/api/workspaces/${wsBody.data.workspaceId}/git/diff?path=src/main.ts`,
      );
      expect(res.status).toBe(200);
      const body = await jsonBody<GitDiffDto>(res);
      expect(body.ok).toBe(true);
      if (body.ok) expect(body.data.diffText).toBeDefined();
    });

    it("returns path_out_of_workspace for traversal", async () => {
      const wsRes = await app.request("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/proj" }),
      });
      const wsBody = await jsonBody<WorkspaceData>(wsRes);
      if (!wsBody.ok) throw new Error("setup failed");

      const res = await app.request(
        `/api/workspaces/${wsBody.data.workspaceId}/git/diff?path=../../../etc/passwd`,
      );
      expect(res.status).toBe(400);
      const body = await jsonBody<never>(res);
      expect(body.ok).toBe(false);
      if (!body.ok) expect(body.error.code).toBe("path_out_of_workspace");
    });
  });
});

// ─── Test helpers ────────────────────────────────────────

function createMockRuntime(
  overrides: Partial<AgentRuntime> = {},
): AgentRuntime {
  return {
    runtimeId: "local",
    validateWorkspace: vi.fn().mockResolvedValue({
      normalizedPath: "/tmp/proj",
      isDirectory: true,
      isWritable: true,
      isGitRepo: true,
    }),
    listSessions: vi
      .fn()
      .mockResolvedValue({ items: [] } as ListSessionsResult),
    createSession: vi.fn().mockResolvedValue({
      session: {
        sessionHandle: "local:sess-1",
        sessionId: "sess-1",
        runtimeId: "local",
        workspacePath: "/tmp/proj",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    } as CreateSessionResult),
    resumeSession: vi.fn().mockResolvedValue({
      session: {
        sessionHandle: "local:sess-1",
        sessionId: "sess-1",
        runtimeId: "local",
        workspacePath: "/tmp/proj",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    } as ResumeSessionResult),
    getSessionState: vi.fn().mockResolvedValue({
      sessionHandle: "local:sess-1",
      isStreaming: false,
      pendingToolCalls: [],
    } as SessionStateDto),
    getSessionMessages: vi.fn().mockResolvedValue({
      sessionHandle: "local:sess-1",
      items: [],
    } as SessionMessagesPageDto),
    prompt: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    getGitChanges: vi.fn().mockResolvedValue({
      workspaceId: "ws-1",
      items: [{ path: "src/main.ts", status: "modified" }],
    } as GitChangesDto),
    getGitDiff: vi.fn().mockResolvedValue({
      workspaceId: "ws-1",
      path: "src/main.ts",
      isBinary: false,
      tooLarge: false,
      diffText: "--- a/src/main.ts\n+++ b/src/main.ts\n",
    } as GitDiffDto),
    subscribe: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  } as unknown as AgentRuntime;
}
