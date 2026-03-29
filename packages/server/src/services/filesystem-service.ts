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

export class FilesystemService {
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
