import { FastifyPluginAsync } from "fastify";
import { Env } from "../config/env";
import { mfaHandlers } from "../handlers/mfaHandlers";
export const mfaRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const h = mfaHandlers(opts.env);
  app.addHook("preHandler", app.requireAuth);
  app.get("/status", (req, reply) => h.status(req, reply));
  app.post("/setup", (req, reply) => h.setup(req, reply));
  app.post("/verify", (req, reply) => h.verify(req, reply));
  app.post("/preference", (req, reply) => h.preference(req, reply));
};
