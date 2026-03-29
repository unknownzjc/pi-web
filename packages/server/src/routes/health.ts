import { Hono } from "hono";
import { ok } from "../server/errors.js";

export function createHealthRoutes(): Hono {
  const router = new Hono();

  router.get("/", (c) => {
    return c.json(ok({ status: "running" }));
  });

  return router;
}
