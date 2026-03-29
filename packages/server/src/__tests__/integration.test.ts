import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import type { AppDeps } from "../server/context.js";
import { createApp } from "../server/app.js";
import { LocalRuntimeAdapter } from "../runtime/local-runtime-adapter.js";
import { StateStore } from "../state/state-store.js";
import { WorkspaceService } from "../services/workspace-service.js";
import { SessionService } from "../services/session-service.js";
import { FilesystemService } from "../services/filesystem-service.js";
import { GitService } from "../services/git-service.js";
import { SubscriptionService } from "../services/subscription-service.js";
import type { ApiResponse } from "../server/errors.js";

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-web-integ-"));
  cleanupDirs.push(dir);
  return dir;
}

async function jsonBody<T>(res: Response): Promise<ApiResponse<T>> {
  return (await res.json()) as ApiResponse<T>;
}

function createIntegrationApp(): { app: Hono; store: StateStore } {
  const store = new StateStore();
  const runtime = new LocalRuntimeAdapter();
  const workspaceService = new WorkspaceService(store, runtime);
  const sessionService = new SessionService(store, runtime, workspaceService);
  const gitService = new GitService(runtime, workspaceService);
  const subscriptionService = new SubscriptionService({
    onPrompt: () => sessionService.prompt("", ""),
    onAbort: (h) => sessionService.abort(h),
    onListModels: () => sessionService.listModels(""),
    onGetState: (h) => sessionService.getSessionState(h),
    onSetModel: (h, p, m) => sessionService.setModel(h, p, m),
    onSetThinkingLevel: (h, l) => sessionService.setThinkingLevel(h, l),
  });

  const deps: AppDeps = {
    runtime,
    store,
    workspaceService,
    sessionService,
    gitService,
    subscriptionService,
    filesystemService: new FilesystemService(),
  };

  return { app: createApp(deps), store };
}

describe("Integration: full workspace lifecycle", () => {
  it("register → list → create session → state → messages → delete", async () => {
    const projectDir = makeTempDir();
    const { app } = createIntegrationApp();

    // 1. Health check
    const healthRes = await app.request("/api/health");
    expect(healthRes.status).toBe(200);

    // 2. Register workspace
    const regRes = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: projectDir, name: "Integration Test" }),
    });
    expect(regRes.status).toBe(200);
    const regBody = await jsonBody<any>(regRes);
    expect(regBody.ok).toBe(true);
    if (!regBody.ok) return;
    const workspaceId = regBody.data.workspaceId;

    // 3. List workspaces
    const listRes = await app.request("/api/workspaces");
    const listBody = await jsonBody<any[]>(listRes);
    expect(listBody.ok).toBe(true);
    if (listBody.ok) expect(listBody.data).toHaveLength(1);

    // 4. Create session
    const sessRes = await app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, name: "Test Session" }),
    });
    expect(sessRes.status).toBe(200);
    const sessBody = await jsonBody<any>(sessRes);
    expect(sessBody.ok).toBe(true);
    if (!sessBody.ok) return;
    const handle = sessBody.data.session.sessionHandle as string;

    // 5. Get session state
    const stateRes = await app.request(`/api/sessions/${handle}/state`);
    expect(stateRes.status).toBe(200);
    const stateBody = await jsonBody<any>(stateRes);
    expect(stateBody.ok).toBe(true);
    if (stateBody.ok) {
      expect(stateBody.data.isStreaming).toBe(false);
    }

    // 6. Get session messages
    const msgRes = await app.request(`/api/sessions/${handle}/messages`);
    expect(msgRes.status).toBe(200);
    const msgBody = await jsonBody<any>(msgRes);
    expect(msgBody.ok).toBe(true);

    // 7. List sessions for workspace
    const wsSessRes = await app.request(
      `/api/workspaces/${workspaceId}/sessions`,
    );
    expect(wsSessRes.status).toBe(200);

    // 8. Abort session
    const abortRes = await app.request(`/api/sessions/${handle}/abort`, {
      method: "POST",
    });
    expect(abortRes.status).toBe(200);

    // 9. Delete workspace
    const delRes = await app.request(`/api/workspaces/${workspaceId}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);

    // 10. Verify workspace is gone
    const delListRes = await app.request("/api/workspaces");
    const delListBody = await jsonBody<any[]>(delListRes);
    if (delListBody.ok) expect(delListBody.data).toHaveLength(0);
  });

  it("error recovery: workspace not found → session not found", async () => {
    const { app } = createIntegrationApp();

    // Workspace not found
    const wsRes = await app.request("/api/workspaces/nonexistent", {
      method: "DELETE",
    });
    expect(wsRes.status).toBe(404);
    const wsBody = await jsonBody<never>(wsRes);
    if (!wsBody.ok) expect(wsBody.error.code).toBe("workspace_not_found");

    // Session create with nonexistent workspace
    const sessRes = await app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "nonexistent" }),
    });
    expect(sessRes.status).toBe(404);
  });

  it("creates session via SDK and returns valid handle", async () => {
    const projectDir = makeTempDir();
    const { app } = createIntegrationApp();

    const regRes = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: projectDir }),
    });
    const regBody = await jsonBody<any>(regRes);
    if (!regBody.ok) return;
    const workspaceId = regBody.data.workspaceId;

    const sessRes = await app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    expect(sessRes.status).toBe(200);

    const sessBody = await jsonBody<any>(sessRes);
    expect(sessBody.ok).toBe(true);
    if (sessBody.ok) {
      expect(sessBody.data.session.sessionHandle).toMatch(/^local:/);
    }
  });
});
