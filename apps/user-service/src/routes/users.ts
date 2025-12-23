import { FastifyPluginAsync } from "fastify";
import { Env } from "../config/env";
import { userHandlers } from "../handlers/userHandlers";

export const usersRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const h = userHandlers(opts.env);

  app.get("/", { preHandler: [async (req) => app.requireAuth(req), async (req) => app.requireRole("admin")(req)] }, (req, reply) => h.list(req, reply));
  app.get("/:userId", { preHandler: [async (req) => app.requireAuth(req), async (req) => app.requireRole("admin")(req)] }, (req, reply) => h.get(req, reply));
  app.post("/", { preHandler: [async (req) => app.requireAuth(req), async (req) => app.requireRole("admin")(req)] }, (req, reply) => h.create(req, reply));
  app.patch("/:userId", { preHandler: [async (req) => app.requireAuth(req), async (req) => app.requireRole("admin")(req)] }, (req, reply) => h.update(req, reply));
  app.delete("/:userId", { preHandler: [async (req) => app.requireAuth(req), async (req) => app.requireRole("admin")(req)] }, (req, reply) => h.remove(req, reply));

  app.post("/:userId/enable", { preHandler: [async (req) => app.requireAuth(req), async (req) => app.requireRole("admin")(req)] }, (req, reply) => h.enable(req, reply));
  app.post("/:userId/disable", { preHandler: [async (req) => app.requireAuth(req), async (req) => app.requireRole("admin")(req)] }, (req, reply) => h.disable(req, reply));
  app.post("/:userId/reset-password", { preHandler: [async (req) => app.requireAuth(req), async (req) => app.requireRole("admin")(req)] }, (req, reply) => h.resetPassword(req, reply));
};
