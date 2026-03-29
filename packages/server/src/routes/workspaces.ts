import { Hono } from "hono";
import type { AppDeps } from "../server/context.js";
import { ok, err } from "../server/errors.js";

export function createWorkspaceRoutes(deps: AppDeps): Hono {
  const router = new Hono();

  // List workspaces
  router.get("/", (c) => {
    const workspaces = deps.workspaceService.list();
    return c.json(ok(workspaces));
  });

  // Register workspace
  router.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || !body.path) {
      return c.json(err("workspace_invalid", "path is required"), 400);
    }

    try {
      const workspace = await deps.workspaceService.register({
        path: body.path,
        name: body.name,
        runtimeId: body.runtimeId,
      });
      return c.json(ok(workspace));
    } catch (e: any) {
      if (e.message === "workspace_invalid") {
        return c.json(err("workspace_invalid", "Invalid workspace path"), 400);
      }
      return c.json(err("internal_error", e.message), 500);
    }
  });

  // Delete workspace
  router.delete("/:workspaceId", (c) => {
    const { workspaceId } = c.req.param();
    try {
      deps.workspaceService.findById(workspaceId);
      deps.workspaceService.delete(workspaceId);
      return c.json(ok({ deleted: true }));
    } catch (e: any) {
      if (e.message === "workspace_not_found") {
        return c.json(err("workspace_not_found", "Workspace not found"), 404);
      }
      return c.json(err("internal_error", e.message), 500);
    }
  });

  return router;
}
