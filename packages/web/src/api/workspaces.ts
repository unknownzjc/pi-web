import { apiFetch } from "./transport.js";
import type { WorkspaceDto } from "../types/dto.js";

export function fetchWorkspaces() {
  return apiFetch<WorkspaceDto[]>("/api/workspaces");
}

export function registerWorkspace(input: {
  runtimeId?: string;
  path: string;
  name?: string;
}) {
  return apiFetch<WorkspaceDto>("/api/workspaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function removeWorkspace(workspaceId: string) {
  return apiFetch<void>(`/api/workspaces/${workspaceId}`, {
    method: "DELETE",
  });
}
