import { Hono } from "hono";
import type { AppDeps } from "../server/context.js";
import { ok, err } from "../server/errors.js";

export function createGitRoutes(deps: AppDeps): Hono {
  const router = new Hono();

  // Get git changes
  router.get("/:workspaceId/git/changes", async (c) => {
    const { workspaceId } = c.req.param();
    try {
      const changes = await deps.gitService.getChanges(workspaceId);
      return c.json(ok(changes));
    } catch (e: any) {
      if (e.message === "workspace_not_found") {
        return c.json(
          err("workspace_not_found", "Workspace not found"),
          404,
        );
      }
      if (e.message === "git_unavailable") {
        return c.json(
          err("git_unavailable", "Git is not available"),
          503,
        );
      }
      return c.json(err("internal_error", e.message), 500);
    }
  });

  // Get git diff
  router.get("/:workspaceId/git/diff", async (c) => {
    const { workspaceId } = c.req.param();
    const path = c.req.query("path");

    if (!path) {
      return c.json(err("workspace_invalid", "path query parameter is required"), 400);
    }

    try {
      const diff = await deps.gitService.getDiff(workspaceId, path);
      return c.json(ok(diff));
    } catch (e: any) {
      if (e.message === "workspace_not_found") {
        return c.json(
          err("workspace_not_found", "Workspace not found"),
          404,
        );
      }
      if (e.message === "path_out_of_workspace") {
        return c.json(
          err("path_out_of_workspace", "Path is outside workspace"),
          400,
        );
      }
      if (e.message === "git_unavailable") {
        return c.json(
          err("git_unavailable", "Git is not available"),
          503,
        );
      }
      return c.json(err("internal_error", e.message), 500);
    }
  });

  return router;
}
