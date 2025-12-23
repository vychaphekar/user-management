import { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/healthz", async () => ({ ok: true }));
  app.get("/readyz", async () => ({ ok: true }));
};
