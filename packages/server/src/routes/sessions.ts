import { Hono } from "hono";
import type { AppDeps } from "../server/context.js";
import { ok, err } from "../server/errors.js";

export function createSessionRoutes(deps: AppDeps): Hono {
  const router = new Hono();

  // List sessions for workspace
  router.get(
    "/api/workspaces/:workspaceId/sessions",
    async (c) => {
      const { workspaceId } = c.req.param();
      const cursor = c.req.query("cursor") || undefined;
      const limit = Number(c.req.query("limit")) || 20;

      try {
        const result = await deps.sessionService.listSessions(
          workspaceId,
          cursor,
          limit,
        );
        return c.json(ok(result));
      } catch (e: any) {
        if (e.message === "workspace_not_found") {
          return c.json(
            err("workspace_not_found", "Workspace not found"),
            404,
          );
        }
        return c.json(err("internal_error", e.message), 500);
      }
    },
  );

  // Create or resume session
  router.post("/api/sessions", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || !body.workspaceId) {
      return c.json(err("workspace_invalid", "workspaceId is required"), 400);
    }

    try {
      if (body.sessionHandle) {
        const result = await deps.sessionService.resumeSession(
          body.workspaceId,
          body.sessionHandle,
        );
        return c.json(ok(result));
      }
      const result = await deps.sessionService.createSession(
        body.workspaceId,
        body.name,
      );
      return c.json(ok(result));
    } catch (e: any) {
      if (e.message === "workspace_not_found") {
        return c.json(
          err("workspace_not_found", "Workspace not found"),
          404,
        );
      }
      if (e.message === "session_not_found") {
        return c.json(
          err("session_not_found", "Session not found"),
          404,
        );
      }
      return c.json(err("internal_error", e.message), 500);
    }
  });

  // Get session state
  router.get("/api/sessions/:sessionHandle/state", async (c) => {
    const { sessionHandle } = c.req.param();
    try {
      const state = await deps.sessionService.getSessionState(sessionHandle);
      return c.json(ok(state));
    } catch (e: any) {
      if (e.message === "session_not_found") {
        return c.json(
          err("session_not_found", "Session not found"),
          404,
        );
      }
      return c.json(err("internal_error", e.message), 500);
    }
  });

  // Get session messages
  router.get("/api/sessions/:sessionHandle/messages", async (c) => {
    const { sessionHandle } = c.req.param();
    const beforeEntryId = c.req.query("beforeEntryId") || undefined;
    const limit = Number(c.req.query("limit")) || 20;

    try {
      const result = await deps.sessionService.getSessionMessages(
        sessionHandle,
        beforeEntryId,
        limit,
      );
      return c.json(ok(result));
    } catch (e: any) {
      if (e.message === "session_not_found") {
        return c.json(
          err("session_not_found", "Session not found"),
          404,
        );
      }
      return c.json(err("internal_error", e.message), 500);
    }
  });

  // Abort session
  router.post("/api/sessions/:sessionHandle/abort", async (c) => {
    const { sessionHandle } = c.req.param();
    try {
      await deps.sessionService.abort(sessionHandle);
      return c.json(ok({ aborted: true }));
    } catch (e: any) {
      return c.json(err("internal_error", e.message), 500);
    }
  });

  return router;
}
