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

export interface SearchEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export function browseFilesystem(path?: string) {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return apiFetch<BrowseResult>(`/api/filesystem/browse${query}`);
}

export function searchFiles(
  cwd: string,
  query: string,
  maxResults = 15,
): Promise<SearchEntry[]> {
  const params = new URLSearchParams({
    cwd,
    query,
    maxResults: String(maxResults),
  });
  return apiFetch<SearchEntry[]>(`/api/filesystem/search?${params}`);
}
