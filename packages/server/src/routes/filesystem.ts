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

  return router;
}
