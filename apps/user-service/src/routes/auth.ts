import { FastifyPluginAsync } from "fastify";
import { Env } from "../config/env";
import { authHandlers } from "../handlers/authHandlers";

export const authRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const h = authHandlers(opts.env);

  app.post("/register", async (req, reply) => h.register(req, reply));
  app.post("/confirm", async (req, reply) => h.confirm(req, reply));
  app.post("/resend-code", async (req, reply) => h.resend(req, reply));
  app.post("/forgot-password", async (req, reply) => h.forgot(req, reply));
  app.post("/confirm-forgot-password", async (req, reply) => h.confirmForgot(req, reply));
};
