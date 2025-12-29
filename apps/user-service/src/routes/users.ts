import { FastifyPluginAsync } from "fastify";
import { Env } from "../config/env";
import { userHandlers } from "../handlers/userHandlers";

export const usersRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const h = userHandlers(opts.env);

  const adminOnly = { preHandler: [app.requireAuth, app.requireRole("admin")] };

  app.get("/", adminOnly, (req, reply) => h.list(req, reply));
  app.get("/:userId", adminOnly, (req, reply) => h.get(req, reply));
  app.post("/", adminOnly, (req, reply) => h.create(req, reply));
  app.patch("/:userId", adminOnly, (req, reply) => h.update(req, reply));
  app.delete("/:userId", adminOnly, (req, reply) => h.remove(req, reply));

  app.post("/:userId/enable", adminOnly, (req, reply) => h.enable(req, reply));
  app.post("/:userId/disable", adminOnly, (req, reply) => h.disable(req, reply));
  app.post("/:userId/reset-password", adminOnly, (req, reply) => h.resetPassword(req, reply));

  app.post("/invite", adminOnly, async (req, reply) => h.invite(req, reply));
};
