import { describe, it, expect, vi } from "vitest";
import type { AgentRuntime } from "../runtime/agent-runtime.js";
import { WorkspaceService } from "../services/workspace-service.js";
import { StateStore } from "../state/state-store.js";

function createMockRuntime(validationResult: {
  normalizedPath: string;
  isDirectory: boolean;
  isWritable: boolean;
  isGitRepo: boolean;
}): AgentRuntime {
  return {
    runtimeId: "local",
    validateWorkspace: vi.fn().mockResolvedValue(validationResult),
    listSessions: vi.fn(),
    createSession: vi.fn(),
    resumeSession: vi.fn(),
    getSessionState: vi.fn(),
    getSessionMessages: vi.fn(),
    prompt: vi.fn(),
    abort: vi.fn(),
    getGitChanges: vi.fn(),
    getGitDiff: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  } as unknown as AgentRuntime;
}

describe("WorkspaceService", () => {
  const store = new StateStore();
  const runtime = createMockRuntime({
    normalizedPath: "/tmp/my-project",
    isDirectory: true,
    isWritable: true,
    isGitRepo: true,
  });
  const service = new WorkspaceService(store, runtime);

  it("register validates workspace via runtime and saves to store", async () => {
    const result = await service.register({
      path: "/tmp/my-project",
      name: "My Project",
    });

    expect(runtime.validateWorkspace).toHaveBeenCalledWith("/tmp/my-project");
    expect(result.workspaceId).toBeTruthy();
    expect(result.path).toBe("/tmp/my-project");
    expect(result.name).toBe("My Project");
    expect(result.isGitRepo).toBe(true);
    expect(result.runtimeId).toBe("local");

    // Verify persisted in store
    const ws = service.findById(result.workspaceId);
    expect(ws).toBeDefined();
  });

  it("register rejects invalid workspace (not a directory)", async () => {
    const badRuntime = createMockRuntime({
      normalizedPath: "/tmp/not-exist",
      isDirectory: false,
      isWritable: false,
      isGitRepo: false,
    });
    const badService = new WorkspaceService(new StateStore(), badRuntime);

    await expect(
      badService.register({ path: "/tmp/not-exist" }),
    ).rejects.toThrow("workspace_invalid");
  });

  it("list returns workspaces sorted by lastUsedAt desc", async () => {
    const freshStore = new StateStore();
    const svc = new WorkspaceService(freshStore, runtime);

    // Register two workspaces
    const ws1 = await svc.register({ path: "/tmp/proj-a" });
    await svc.register({ path: "/tmp/proj-b" });

    // Update lastUsedAt for first one to be more recent
    freshStore.updateLastUsed(ws1.workspaceId);

    const list = svc.list();
    expect(list).toHaveLength(2);
    // ws1 was used more recently, so it should be first
    expect(list[0].workspaceId).toBe(ws1.workspaceId);
  });

  it("delete removes workspace from store only", async () => {
    const freshStore = new StateStore();
    const svc = new WorkspaceService(freshStore, runtime);

    const ws = await svc.register({ path: "/tmp/to-delete" });
    expect(svc.findById(ws.workspaceId)).toBeDefined();

    svc.delete(ws.workspaceId);
    expect(() => svc.findById(ws.workspaceId)).toThrow("workspace_not_found");
  });

  it("findById returns matching workspace", async () => {
    const freshStore = new StateStore();
    const svc = new WorkspaceService(freshStore, runtime);

    const ws = await svc.register({ path: "/tmp/find-me" });
    const found = svc.findById(ws.workspaceId);
    expect(found.workspaceId).toBe(ws.workspaceId);
  });

  it("findById throws workspace_not_found for unknown id", () => {
    expect(() => service.findById("nonexistent")).toThrow("workspace_not_found");
  });
});
