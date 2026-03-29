import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StateStore } from "../state/state-store.js";

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-web-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("StateStore file persistence", () => {
  describe("writeToFile", () => {
    it("creates state.json with correct content", () => {
      const tempDir = makeTempDir();
      const statePath = join(tempDir, "state.json");

      const store = new StateStore();
      store.addWorkspace({
        workspaceId: "ws-1",
        runtimeId: "local",
        path: "/tmp/my-project",
        name: "My Project",
        isGitRepo: true,
      });

      store.writeToFile(statePath);

      expect(existsSync(statePath)).toBe(true);
      const content = JSON.parse(readFileSync(statePath, "utf-8"));
      expect(content.schemaVersion).toBe(1);
      expect(content.workspaces).toHaveLength(1);
      expect(content.workspaces[0].workspaceId).toBe("ws-1");
    });

    it("uses atomic write (no partial file on failure)", () => {
      const tempDir = makeTempDir();
      const statePath = join(tempDir, "state.json");

      const store = new StateStore();
      const badPath = "/nonexistent-dir/deep/nested/state.json";
      expect(() => store.writeToFile(badPath)).toThrow();
      expect(existsSync(statePath)).toBe(false);
    });
  });

  describe("readFromFile", () => {
    it("loads valid state.json", () => {
      const tempDir = makeTempDir();
      const statePath = join(tempDir, "state.json");

      writeFileSync(
        statePath,
        JSON.stringify({
          schemaVersion: 1,
          workspaces: [
            {
              workspaceId: "ws-1",
              runtimeId: "local",
              path: "/tmp/proj",
              isGitRepo: false,
            },
          ],
          recentWorkspaceId: "ws-1",
        }),
      );

      const store = StateStore.readFromFile(statePath);
      expect(store.workspaces).toHaveLength(1);
      expect(store.workspaces[0].workspaceId).toBe("ws-1");
      expect(store.recentWorkspaceId).toBe("ws-1");
    });

    it("gracefully handles corrupted JSON → returns empty state", () => {
      const tempDir = makeTempDir();
      const statePath = join(tempDir, "state.json");

      writeFileSync(statePath, "{ invalid json !!!");

      const store = StateStore.readFromFile(statePath);
      expect(store.workspaces).toHaveLength(0);
    });

    it("gracefully handles missing file → returns empty state", () => {
      const tempDir = makeTempDir();
      const statePath = join(tempDir, "state.json");

      const store = StateStore.readFromFile(statePath);
      expect(store.workspaces).toHaveLength(0);
    });
  });

  describe("save (round-trip)", () => {
    it("persists addWorkspace correctly", () => {
      const tempDir = makeTempDir();
      const statePath = join(tempDir, "state.json");

      const store = new StateStore();
      store.addWorkspace({
        workspaceId: "ws-1",
        runtimeId: "local",
        path: "/tmp/proj",
        name: "Proj",
        isGitRepo: true,
      });
      store.setRecentWorkspace("ws-1");
      store.writeToFile(statePath);

      const loaded = StateStore.readFromFile(statePath);
      expect(loaded.workspaces).toHaveLength(1);
      expect(loaded.workspaces[0].workspaceId).toBe("ws-1");
      expect(loaded.recentWorkspaceId).toBe("ws-1");
    });

    it("persists addWorkspace + removeWorkspace round-trip", () => {
      const tempDir = makeTempDir();
      const statePath = join(tempDir, "state.json");

      const store = new StateStore();
      store.addWorkspace({
        workspaceId: "ws-1",
        runtimeId: "local",
        path: "/tmp/proj",
        isGitRepo: false,
      });
      store.addWorkspace({
        workspaceId: "ws-2",
        runtimeId: "local",
        path: "/tmp/other",
        isGitRepo: false,
      });
      store.removeWorkspace("ws-1");
      store.writeToFile(statePath);

      const loaded = StateStore.readFromFile(statePath);
      expect(loaded.workspaces).toHaveLength(1);
      expect(loaded.workspaces[0].workspaceId).toBe("ws-2");
    });

    it("save() is a convenience alias for writeToFile", () => {
      const tempDir = makeTempDir();
      const statePath = join(tempDir, "state.json");

      const store = new StateStore();
      store.addWorkspace({
        workspaceId: "ws-x",
        runtimeId: "local",
        path: "/tmp/x",
        isGitRepo: false,
      });
      store.save(statePath);

      const loaded = StateStore.readFromFile(statePath);
      expect(loaded.workspaces[0].workspaceId).toBe("ws-x");
    });
  });
});
