import { apiFetch } from "./transport.js";

export interface DirEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  path: string;
  parentPath: string | null;
  entries: DirEntry[];
}

export function browseFilesystem(path?: string) {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return apiFetch<BrowseResult>(`/api/filesystem/browse${query}`);
}
