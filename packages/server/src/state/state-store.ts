import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { StateSchema, WorkspaceEntry } from "./state-schema.js";

export class StateStore {
  private state: StateSchema;
  private persistPath?: string;

  constructor(initial?: StateSchema, persistPath?: string) {
    this.state = initial
      ? { ...initial, workspaces: [...initial.workspaces] }
      : { schemaVersion: 1, workspaces: [] };
    this.persistPath = persistPath;
  }

  private persist(): void {
    if (this.persistPath) {
      this.writeToFile(this.persistPath);
    }
  }

  get workspaces(): readonly WorkspaceEntry[] {
    return this.state.workspaces;
  }

  get recentWorkspaceId(): string | undefined {
    return this.state.recentWorkspaceId;
  }

  get recentSessionHandle(): string | undefined {
    return this.state.recentSessionHandle;
  }

  addWorkspace(entry: WorkspaceEntry): void {
    this.state.workspaces.push(entry);
    this.persist();
  }

  removeWorkspace(workspaceId: string): void {
    this.state.workspaces = this.state.workspaces.filter(
      (w) => w.workspaceId !== workspaceId,
    );
    this.persist();
  }

  setRecentWorkspace(workspaceId: string | undefined): void {
    this.state.recentWorkspaceId = workspaceId;
    this.persist();
  }

  setRecentSession(handle: string | undefined): void {
    this.state.recentSessionHandle = handle;
    this.persist();
  }

  updateLastUsed(workspaceId: string): void {
    const ws = this.state.workspaces.find(
      (w) => w.workspaceId === workspaceId,
    );
    if (ws) {
      ws.lastUsedAt = new Date().toISOString();
      this.persist();
    }
  }

  toJSON(): StateSchema {
    return { ...this.state };
  }

  /**
   * Persist state to disk using atomic write (tmp + rename).
   */
  writeToFile(filePath: string): void {
    const tmpPath = join(dirname(filePath), ".state.json.tmp");
    const data = JSON.stringify(this.state, null, 2);
    writeFileSync(tmpPath, data, "utf-8");
    renameSync(tmpPath, filePath);
  }

  /**
   * Convenience alias for writeToFile.
   */
  save(filePath: string): void {
    this.writeToFile(filePath);
  }

  /**
   * Read state from disk. Returns empty state on missing or corrupted file.
   */
  static readFromFile(filePath: string): StateStore {
    try {
      if (!existsSync(filePath)) {
        return new StateStore(undefined, filePath);
      }
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as StateSchema;
      return new StateStore(parsed, filePath);
    } catch {
      console.warn(
        `[StateStore] Failed to read ${filePath}, starting with empty state`,
      );
      return new StateStore(undefined, filePath);
    }
  }
}
