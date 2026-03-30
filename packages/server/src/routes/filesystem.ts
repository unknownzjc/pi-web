import { Hono } from "hono";
import type { AppDeps } from "../server/context.js";
import { ok, err } from "../server/errors.js";

export function createFilesystemRoutes(deps: AppDeps): Hono {
  const router = new Hono();

  router.get("/browse", (c) => {
    const rawPath = c.req.query("path") ?? undefined;
    try {
      const result = deps.filesystemService.browse(rawPath);
      return c.json(ok(result));
    } catch (e: any) {
      const msg = e.message ?? "internal_error";
      if (msg === "path_not_found") {
        return c.json(err("path_not_found", "Directory not found"), 404);
      }
      if (msg === "path_permission_denied") {
        return c.json(err("path_permission_denied", "Permission denied"), 403);
      }
      return c.json(err("internal_error", e.message ?? "Unknown error"), 500);
    }
  });

  router.get("/search", (c) => {
    const cwd = c.req.query("cwd");
    if (!cwd) {
      return c.json(err("path_not_found", "cwd is required"), 400);
    }
    const query = c.req.query("query") ?? "";
    const maxResults = parseInt(c.req.query("maxResults") ?? "15", 10) || 15;
    try {
      const entries = deps.filesystemService.searchFiles(cwd, query, maxResults);
      return c.json(ok(entries));
    } catch (e: any) {
      const msg = e.message ?? "internal_error";
      if (msg === "path_not_found") {
        return c.json(err("path_not_found", "Directory not found"), 404);
      }
      if (msg === "path_permission_denied") {
        return c.json(err("path_permission_denied", "Permission denied"), 403);
      }
      return c.json(err("internal_error", e.message ?? "Unknown error"), 500);
    }
  });

  return router;
}
