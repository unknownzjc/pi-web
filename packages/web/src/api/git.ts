import { apiFetch } from "./transport.js";

interface GitChangesData {
  workspaceId: string;
  items: Array<{
    path: string;
    status: "modified" | "added" | "deleted" | "untracked";
    isBinary?: boolean;
  }>;
}

interface GitDiffData {
  workspaceId: string;
  path: string;
  isBinary: boolean;
  tooLarge: boolean;
  diffText?: string;
}

export function fetchGitChanges(workspaceId: string) {
  return apiFetch<GitChangesData>(
    `/api/workspaces/${workspaceId}/git/changes`,
  );
}

export function fetchGitDiff(workspaceId: string, relativePath: string) {
  const params = new URLSearchParams({ path: relativePath });
  return apiFetch<GitDiffData>(
    `/api/workspaces/${workspaceId}/git/diff?${params}`,
  );
}
