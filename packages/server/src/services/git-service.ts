import type { AgentRuntime } from "../runtime/agent-runtime.js";
import type { GitChangesDto, GitDiffDto } from "../runtime/runtime-types.js";
import { ensureRelativePath } from "../utils/path-safety.js";
import { WorkspaceService } from "./workspace-service.js";

export class GitService {
  constructor(
    private runtime: AgentRuntime,
    private workspaceService: WorkspaceService,
  ) {}

  async getChanges(workspaceId: string): Promise<GitChangesDto> {
    const ws = this.workspaceService.findById(workspaceId);
    return this.runtime.getGitChanges({ workspacePath: ws.path });
  }

  async getDiff(workspaceId: string, relativePath: string): Promise<GitDiffDto> {
    const ws = this.workspaceService.findById(workspaceId);
    // Validate the path is within workspace boundary
    const resolvedPath = ensureRelativePath(ws.path, relativePath);
    return this.runtime.getGitDiff({
      workspacePath: ws.path,
      relativePath: resolvedPath,
    });
  }
}
