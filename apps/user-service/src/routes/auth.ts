import { FastifyPluginAsync } from "fastify";
import { Env } from "../config/env";
import { authHandlers } from "../handlers/authHandlers";

export const authRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const h = authHandlers(opts.env);

  app.post("/login", async (req, reply) => h.login(req, reply));
  app.post("/refresh", async (req, reply) => h.refresh(req, reply));

  // B-flow: invite link lands on API
  app.get("/invite/accept", async (req, reply) => h.acceptInvite(req, reply));
  app.post("/invite/accept", async (req, reply) => h.acceptInvite(req, reply));

  // optional
  app.post("/forgot-password", async (req, reply) => h.forgot(req, reply));
  app.post("/confirm-forgot-password", async (req, reply) => h.confirmForgot(req, reply));
};
