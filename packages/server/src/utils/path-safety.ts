import { normalize, resolve } from "node:path";

export function ensureRelativePath(
  workspaceRoot: string,
  relativePath: string,
): string {
  const normalized = normalize(relativePath);
  const resolved = resolve(workspaceRoot, normalized);

  if (!resolved.startsWith(workspaceRoot + "/") && resolved !== workspaceRoot) {
    throw new Error("path_out_of_workspace");
  }

  return resolved;
}
