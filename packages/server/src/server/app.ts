import { Hono } from "hono";
import type { AppDeps } from "./context.js";
import { createHealthRoutes } from "../routes/health.js";
import { createWorkspaceRoutes } from "../routes/workspaces.js";
import { createSessionRoutes } from "../routes/sessions.js";
import { createGitRoutes } from "../routes/git.js";
import { createFilesystemRoutes } from "../routes/filesystem.js";

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.route("/api/health", createHealthRoutes());
  app.route("/api/filesystem", createFilesystemRoutes(deps));
  app.route("/api/workspaces", createWorkspaceRoutes(deps));
  app.route("/api/workspaces", createGitRoutes(deps));
  app.route("/", createSessionRoutes(deps));

  return app;
}
