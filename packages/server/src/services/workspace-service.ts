import { randomUUID } from "node:crypto";
import type { AgentRuntime } from "../runtime/agent-runtime.js";
import type { WorkspaceEntry } from "../state/state-schema.js";
import { StateStore } from "../state/state-store.js";

export interface RegisterWorkspaceInput {
  path: string;
  name?: string;
  runtimeId?: string;
}

export class WorkspaceService {
  constructor(
    private store: StateStore,
    private runtime: AgentRuntime,
  ) {}

  async register(input: RegisterWorkspaceInput): Promise<WorkspaceEntry> {
    const validation = await this.runtime.validateWorkspace(input.path);

    if (!validation.isDirectory || !validation.isWritable) {
      throw new Error("workspace_invalid");
    }

    const entry: WorkspaceEntry = {
      workspaceId: randomUUID(),
      runtimeId: this.runtime.runtimeId,
      path: validation.normalizedPath,
      name: input.name,
      isGitRepo: validation.isGitRepo,
      lastUsedAt: new Date().toISOString(),
    };

    this.store.addWorkspace(entry);
    return entry;
  }

  list(): readonly WorkspaceEntry[] {
    return [...this.store.workspaces].sort((a, b) => {
      const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  delete(workspaceId: string): void {
    this.store.removeWorkspace(workspaceId);
  }

  findById(workspaceId: string): WorkspaceEntry {
    const ws = this.store.workspaces.find(
      (w) => w.workspaceId === workspaceId,
    );
    if (!ws) throw new Error("workspace_not_found");
    return ws;
  }
}
