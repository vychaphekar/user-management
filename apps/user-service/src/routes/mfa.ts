import { FastifyPluginAsync } from "fastify";
import { Env } from "../config/env";
import { mfaHandlers } from "../handlers/mfaHandlers";

export const mfaRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const h = mfaHandlers(opts.env);

  app.post("/setup", async (req, reply) => h.setup(req, reply));
  app.post("/verify", async (req, reply) => h.verify(req, reply));
  app.post("/preference", async (req, reply) => h.preference(req, reply));
};
