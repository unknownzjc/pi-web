import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentRuntime } from "../runtime/agent-runtime.js";
import type { GitChangesDto, GitDiffDto } from "../runtime/runtime-types.js";
import { GitService } from "../services/git-service.js";
import { WorkspaceService } from "../services/workspace-service.js";
import { StateStore } from "../state/state-store.js";

function createMockRuntime(gitFns: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    runtimeId: "local",
    validateWorkspace: vi.fn().mockResolvedValue({
      normalizedPath: "/tmp/proj",
      isDirectory: true,
      isWritable: true,
      isGitRepo: true,
    }),
    listSessions: vi.fn(),
    createSession: vi.fn(),
    resumeSession: vi.fn(),
    getSessionState: vi.fn(),
    getSessionMessages: vi.fn(),
    prompt: vi.fn(),
    abort: vi.fn(),
    getGitChanges: vi
      .fn()
      .mockResolvedValue({
        workspaceId: "ws-1",
        items: [{ path: "src/main.ts", status: "modified" as const }],
      } satisfies GitChangesDto),
    getGitDiff: vi
      .fn()
      .mockResolvedValue({
        workspaceId: "ws-1",
        path: "src/main.ts",
        isBinary: false,
        tooLarge: false,
        diffText: "--- a/src/main.ts\n+++ b/src/main.ts\n",
      } satisfies GitDiffDto),
    subscribe: vi.fn().mockReturnValue(() => {}),
    ...gitFns,
  } as unknown as AgentRuntime;
}

describe("GitService", () => {
  let store: StateStore;
  let runtime: AgentRuntime;
  let workspaceService: WorkspaceService;
  let gitService: GitService;
  let workspaceId: string;

  beforeEach(async () => {
    store = new StateStore();
    runtime = createMockRuntime();
    workspaceService = new WorkspaceService(store, runtime);
    gitService = new GitService(runtime, workspaceService);

    const ws = await workspaceService.register({ path: "/tmp/proj" });
    workspaceId = ws.workspaceId;
  });

  it("getChanges delegates to runtime with workspacePath", async () => {
    const result = await gitService.getChanges(workspaceId);

    expect(runtime.getGitChanges).toHaveBeenCalledWith({
      workspacePath: "/tmp/proj",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].path).toBe("src/main.ts");
  });

  it("getDiff validates relative path is within workspace", async () => {
    const result = await gitService.getDiff(workspaceId, "src/main.ts");

    expect(runtime.getGitDiff).toHaveBeenCalledWith({
      workspacePath: "/tmp/proj",
      relativePath: expect.any(String),
    });
    expect(result.diffText).toContain("--- a/src/main.ts");
  });

  it("getDiff rejects path traversal with path_out_of_workspace", async () => {
    await expect(
      gitService.getDiff(workspaceId, "../../etc/passwd"),
    ).rejects.toThrow("path_out_of_workspace");
  });

  it("git unavailable returns git_unavailable error gracefully", async () => {
    const badRuntime = createMockRuntime({
      getGitChanges: vi.fn().mockRejectedValue(new Error("git_unavailable")),
      getGitDiff: vi.fn().mockRejectedValue(new Error("git_unavailable")),
    });
    const badService = new GitService(badRuntime, workspaceService);

    await expect(badService.getChanges(workspaceId)).rejects.toThrow(
      "git_unavailable",
    );
  });

  it("unknown workspaceId throws workspace_not_found", async () => {
    await expect(gitService.getChanges("nonexistent")).rejects.toThrow(
      "workspace_not_found",
    );
  });
});
