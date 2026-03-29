export interface WorkspaceEntry {
  workspaceId: string;
  runtimeId: string;
  path: string;
  name?: string;
  isGitRepo: boolean;
  lastUsedAt?: string;
}

export interface StateSchema {
  schemaVersion: 1;
  workspaces: WorkspaceEntry[];
  recentWorkspaceId?: string;
  recentSessionHandle?: string;
  uiState?: {
    gitDrawerOpen?: boolean;
  };
}
