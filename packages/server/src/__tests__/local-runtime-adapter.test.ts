import { describe, it, expect, vi, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalRuntimeAdapter } from "../runtime/local-runtime-adapter.js";

// Mock the pi-coding-agent SDK
const mockSessionInfos: Array<{
  id: string;
  path: string;
  cwd: string;
  name?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
  allMessagesText: string;
}> = [];

const mockSessionFiles = new Map<
  string,
  {
    getSessionId: () => string;
    getSessionName: () => string | undefined;
    getSessionFile: () => string | undefined;
    getCwd: () => string;
    getHeader: () => { timestamp: string } | null;
    buildSessionContext: () => { messages: any[] };
    appendSessionInfo: (name: string) => void;
    newSession: (opts?: { id?: string }) => void;
  }
>();

vi.mock("@mariozechner/pi-coding-agent", () => ({
  createAgentSession: vi.fn().mockResolvedValue({
    session: {
      subscribe: vi.fn().mockReturnValue(vi.fn()),
      prompt: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
      messages: [],
      model: undefined,
      isStreaming: false,
      sessionId: "mock-sdk-session",
      sessionFile: "/mock/session.jsonl",
    },
  }),
  ModelRegistry: vi.fn().mockImplementation(function () {
    return {
      getAvailable: vi.fn(() => []),
      getAll: vi.fn(() => []),
      find: vi.fn(() => undefined),
    };
  }),
  AuthStorage: {
    create: vi.fn(() => ({})),
    inMemory: vi.fn(() => ({})),
  },
  SessionManager: {
    create: vi.fn((cwd: string) => {
      const id = `mock-${Date.now()}`;
      const file = `/mock/sessions/${id}.jsonl`;
      let storedName: string | undefined;
      const mock = {
        getSessionId: () => id,
        getSessionName: () => storedName,
        getSessionFile: () => file,
        getCwd: () => cwd,
        getHeader: () => ({ timestamp: new Date().toISOString() }),
        buildSessionContext: () => ({ messages: [] }),
        appendSessionInfo: vi.fn((name: string) => {
          storedName = name;
        }),
        newSession: vi.fn(),
      };
      mockSessionFiles.set(file, mock);
      return mock;
    }),
    open: vi.fn((path: string) => {
      const mock = mockSessionFiles.get(path);
      if (mock) return mock;
      return {
        getSessionId: () => "opened-id",
        getSessionName: () => undefined,
        getSessionFile: () => path,
        getCwd: () => "/mock/cwd",
        getHeader: () => ({ timestamp: new Date().toISOString() }),
        buildSessionContext: () => ({ messages: [] }),
        appendSessionInfo: vi.fn(),
        newSession: vi.fn(),
      };
    }),
    list: vi.fn(async () => {
      return mockSessionInfos.splice(0);
    }),
  },
}));

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
  mockSessionInfos.length = 0;
  mockSessionFiles.clear();
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-web-rt-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("LocalRuntimeAdapter", () => {
  const adapter = new LocalRuntimeAdapter();

  describe("validateWorkspace", () => {
    it("returns valid result for existing writable directory", async () => {
      const dir = makeTempDir();
      const result = await adapter.validateWorkspace(dir);
      expect(result.isDirectory).toBe(true);
      expect(result.isWritable).toBe(true);
      expect(result.normalizedPath).toBe(dir);
    });

    it("returns isDirectory=false for non-existent path", async () => {
      const result = await adapter.validateWorkspace("/nonexistent/path/xyz");
      expect(result.isDirectory).toBe(false);
      expect(result.normalizedPath).toBe("/nonexistent/path/xyz");
    });

    it("detects git repo via .git presence", async () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".git"));
      const result = await adapter.validateWorkspace(dir);
      expect(result.isGitRepo).toBe(true);
    });

    it("returns isGitRepo=false when no .git", async () => {
      const dir = makeTempDir();
      const result = await adapter.validateWorkspace(dir);
      expect(result.isGitRepo).toBe(false);
    });
  });

  describe("listSessions", () => {
    it("returns empty list for workspace with no sessions", async () => {
      const dir = makeTempDir();
      const result = await adapter.listSessions({
        workspacePath: dir,
        limit: 10,
      });
      expect(result.items).toHaveLength(0);
    });

    it("enumerates SDK sessions via SessionManager.list", async () => {
      const dir = makeTempDir();

      mockSessionInfos.push(
        {
          id: "sess-001",
          path: "/mock/sess-001.jsonl",
          cwd: dir,
          name: "Test Session 1",
          created: new Date("2025-01-02T00:00:00Z"),
          modified: new Date("2025-01-02T00:00:00Z"),
          messageCount: 2,
          firstMessage: "hello",
          allMessagesText: "hello world",
        },
        {
          id: "sess-002",
          path: "/mock/sess-002.jsonl",
          cwd: dir,
          created: new Date("2025-01-01T00:00:00Z"),
          modified: new Date("2025-01-01T00:00:00Z"),
          messageCount: 0,
          firstMessage: "",
          allMessagesText: "",
        },
      );

      const result = await adapter.listSessions({
        workspacePath: dir,
        limit: 10,
      });
      expect(result.items).toHaveLength(2);
      // Sorted by updatedAt desc, so sess-001 first
      expect(result.items[0].sessionId).toBe("sess-001");
    });

    it("generates stable sessionHandle in local:<sessionId> format", async () => {
      const dir = makeTempDir();

      mockSessionInfos.push({
        id: "sess-001",
        path: "/mock/sess-001.jsonl",
        cwd: dir,
        created: new Date("2025-01-01T00:00:00Z"),
        modified: new Date("2025-01-01T00:00:00Z"),
        messageCount: 0,
        firstMessage: "",
        allMessagesText: "",
      });

      const result = await adapter.listSessions({
        workspacePath: dir,
        limit: 10,
      });
      expect(result.items[0].sessionHandle).toBe("local:sess-001");
    });

    it("respects limit parameter", async () => {
      const dir = makeTempDir();

      for (let i = 1; i <= 5; i++) {
        mockSessionInfos.push({
          id: `sess-${String(i).padStart(3, "0")}`,
          path: `/mock/sess-${i}.jsonl`,
          cwd: dir,
          created: new Date(`2025-01-0${i}T00:00:00Z`),
          modified: new Date(`2025-01-0${i}T00:00:00Z`),
          messageCount: 0,
          firstMessage: "",
          allMessagesText: "",
        });
      }

      const result = await adapter.listSessions({
        workspacePath: dir,
        limit: 2,
      });
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeDefined();
    });
  });

  describe("createSession", () => {
    it("creates new session with metadata", async () => {
      const dir = makeTempDir();

      const result = await adapter.createSession({
        workspacePath: dir,
        name: "My Session",
      });

      expect(result.session.sessionHandle).toMatch(/^local:/);
      expect(result.session.sessionName).toBe("My Session");
      expect(result.session.workspacePath).toBe(dir);
    });
  });

  describe("resumeSession", () => {
    it("returns existing session summary", async () => {
      const dir = makeTempDir();
      const created = await adapter.createSession({
        workspacePath: dir,
        name: "Resume Me",
      });

      const resumed = await adapter.resumeSession({
        sessionHandle: created.session.sessionHandle,
      });

      expect(resumed.session.sessionHandle).toBe(
        created.session.sessionHandle,
      );
      expect(resumed.session.sessionName).toBe("Resume Me");
    });

    it("throws session_not_found for unknown handle", async () => {
      await expect(
        adapter.resumeSession({ sessionHandle: "local:nonexistent" }),
      ).rejects.toThrow("session_not_found");
    });
  });

  describe("getSessionState", () => {
    it("inactive session returns static state with isStreaming=false", async () => {
      const dir = makeTempDir();
      const created = await adapter.createSession({ workspacePath: dir });

      const state = await adapter.getSessionState({
        sessionHandle: created.session.sessionHandle,
      });

      expect(state.isStreaming).toBe(false);
      expect(state.pendingToolCalls).toEqual([]);
      expect(state.sessionHandle).toBe(created.session.sessionHandle);
    });
  });

  describe("getSessionMessages", () => {
    it("returns empty messages for new session", async () => {
      const dir = makeTempDir();
      const created = await adapter.createSession({ workspacePath: dir });

      const page = await adapter.getSessionMessages({
        sessionHandle: created.session.sessionHandle,
        limit: 10,
      });

      expect(page.items).toHaveLength(0);
      expect(page.sessionHandle).toBe(created.session.sessionHandle);
    });
  });

  describe("prompt and abort", () => {
    it("prompt on unknown session creates a new SDK session", async () => {
      // With the new implementation, prompt always creates an active session
      // via the SDK even if the session wasn't previously indexed.
      await expect(
        adapter.prompt({
          sessionHandle: "local:nonexistent",
          text: "hello",
        }),
      ).resolves.toBeUndefined();
    });

    it("abort on non-active session completes without error", async () => {
      // Should be a no-op for inactive sessions
      const dir = makeTempDir();
      const created = await adapter.createSession({ workspacePath: dir });

      await expect(
        adapter.abort({ sessionHandle: created.session.sessionHandle }),
      ).resolves.toBeUndefined();
    });
  });

  describe("subscribe", () => {
    it("registers event listener and returns unsubscribe function", () => {
      const listener = vi.fn();
      const unsub = adapter.subscribe(listener);
      expect(typeof unsub).toBe("function");
      unsub();
    });
  });
});
