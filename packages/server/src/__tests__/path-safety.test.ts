import { describe, it, expect } from "vitest";
import { ensureRelativePath } from "../utils/path-safety.js";

describe("ensureRelativePath", () => {
  const workspaceRoot = "/tmp/test-workspace";

  it("resolves normal relative path inside workspace", () => {
    const result = ensureRelativePath(workspaceRoot, "src/main.ts");
    expect(result).toBe(`${workspaceRoot}/src/main.ts`);
  });

  it("resolves workspace root itself", () => {
    const result = ensureRelativePath(workspaceRoot, ".");
    expect(result).toBe(workspaceRoot);
  });

  it("rejects parent directory traversal", () => {
    expect(() => ensureRelativePath(workspaceRoot, "../etc/passwd")).toThrow(
      "path_out_of_workspace",
    );
  });

  it("rejects deep traversal", () => {
    expect(() =>
      ensureRelativePath(workspaceRoot, "foo/../../etc/passwd"),
    ).toThrow("path_out_of_workspace");
  });

  it("rejects absolute path escape", () => {
    expect(() => ensureRelativePath(workspaceRoot, "/etc/passwd")).toThrow(
      "path_out_of_workspace",
    );
  });

  it("handles nested relative path", () => {
    const result = ensureRelativePath(
      workspaceRoot,
      "a/b/c/../../../d/e.ts",
    );
    expect(result).toBe(`${workspaceRoot}/d/e.ts`);
  });
});
