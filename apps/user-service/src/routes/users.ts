import { FastifyPluginAsync } from "fastify";
import { Env } from "../config/env";
import { userHandlers } from "../handlers/userHandlers";
import { Permission } from "../services/roleStore";

export const usersRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const h = userHandlers(opts.env);

  const permitted = (permission: Permission) => ({ preHandler: [app.requireAuth, app.requirePermission(permission)] });

  app.get("/", permitted("users.read"), (req, reply) => h.list(req, reply));
  app.get("/:userId", permitted("users.read"), (req, reply) => h.get(req, reply));
  app.post("/", permitted("users.invite"), (req, reply) => h.create(req, reply));
  // Each submitted field has its own permission check in the handler.
  app.patch("/:userId", { preHandler: [app.requireAuth] }, (req, reply) => h.update(req, reply));
  app.delete("/:userId", permitted("users.delete"), (req, reply) => h.remove(req, reply));

  app.post("/:userId/enable", permitted("users.disable"), (req, reply) => h.enable(req, reply));
  app.post("/:userId/disable", permitted("users.disable"), (req, reply) => h.disable(req, reply));
  app.post("/:userId/reset-password", permitted("users.reset_password"), (req, reply) => h.resetPassword(req, reply));

  app.post("/:userId/invitation/resend", permitted("users.invite"), (req, reply) => h.resend(req, reply));
  app.post("/invite", permitted("users.invite"), async (req, reply) => h.invite(req, reply));
};
