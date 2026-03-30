import { homedir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { readdirSync, realpathSync, existsSync, statSync } from "node:fs";

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

export class FilesystemService {
  searchFiles(cwd: string, query: string, maxResults = 15): SearchEntry[] {
    const canonicalCwd = realpathSync(resolve(cwd));

    let searchDir: string;
    let prefix: string;

    if (query.includes("/")) {
      const lastSlash = query.lastIndexOf("/");
      const dirPart = query.slice(0, lastSlash + 1);
      prefix = query.slice(lastSlash + 1);
      searchDir = resolve(canonicalCwd, dirPart);
    } else {
      searchDir = canonicalCwd;
      prefix = query;
    }

    // Security: ensure resolved path is within cwd
    let resolvedDir: string;
    try {
      resolvedDir = realpathSync(searchDir);
    } catch {
      return [];
    }
    if (!resolvedDir.startsWith(canonicalCwd)) {
      return [];
    }

    let dirents;
    try {
      dirents = readdirSync(resolvedDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const showHidden = prefix.startsWith(".");
    const relativeDirPrefix =
      resolvedDir === canonicalCwd
        ? ""
        : resolvedDir.slice(canonicalCwd.length + 1) + "/";

    const entries: SearchEntry[] = dirents
      .filter((d) => {
        if (!showHidden && d.name.startsWith(".")) return false;
        if (prefix && !d.name.toLowerCase().startsWith(prefix.toLowerCase()))
          return false;
        return d.isDirectory() || d.isFile();
      })
      .map((d) => ({
        name: d.isDirectory() ? d.name + "/" : d.name,
        path: relativeDirPrefix + (d.isDirectory() ? d.name + "/" : d.name),
        isDirectory: d.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, maxResults);

    return entries;
  }

  browse(inputPath?: string): BrowseResult {
    const raw = inputPath?.trim();

    // Resolve to home if empty or ~
    let target: string;
    if (!raw || raw === "~") {
      target = homedir();
    } else if (raw.startsWith("~/")) {
      target = join(homedir(), raw.slice(2));
    } else {
      target = raw;
    }

    // Canonicalize
    const resolved = resolve(target);

    if (!existsSync(resolved)) {
      throw new Error("path_not_found");
    }

    let canonical: string;
    try {
      canonical = realpathSync(resolved);
    } catch {
      throw new Error("path_not_found");
    }

    // Verify it's a directory
    let stat;
    try {
      stat = statSync(canonical);
    } catch {
      throw new Error("path_not_found");
    }
    if (!stat.isDirectory()) {
      throw new Error("path_not_found");
    }

    // List entries
    let dirents;
    try {
      dirents = readdirSync(canonical, { withFileTypes: true });
    } catch (e: any) {
      if (e.code === "EACCES" || e.code === "EPERM") {
        throw new Error("path_permission_denied");
      }
      throw new Error("internal_error");
    }

    const entries: DirEntry[] = dirents
      .filter((d) => d.isDirectory())
      .map((d) => ({ name: d.name, path: join(canonical, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = canonical === "/" ? null : dirname(canonical);

    return { path: canonical, parentPath, entries };
  }
}
