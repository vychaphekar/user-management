import Fastify, { FastifyRequest } from "fastify";
import sensible from "@fastify/sensible";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { Env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { tenantContextPlugin } from "./middleware/tenantContext";
import { authPlugin } from "./middleware/auth";
import { registerRoutes } from "./app";

export async function buildServer(env: Env) {
  const app = Fastify({ logger: { level: env.LOG_LEVEL }, disableRequestLogging: true, bodyLimit: 32768 });
  await app.register(sensible);
  app.setErrorHandler(errorHandler);
  await app.register(cookie);
  await app.register(tenantContextPlugin, { env });
  // Reject untrusted origins before CORS can short-circuit an OPTIONS request.
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const origin = req.headers.origin;
    const allowed = req.tenant.uiBaseUrl ? new URL(req.tenant.uiBaseUrl).origin : undefined;
    if (origin && origin !== allowed) throw app.httpErrors.forbidden("Origin not allowed");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !req.headers.authorization && (!origin || origin !== allowed)) {
      throw app.httpErrors.forbidden("A trusted application origin is required");
    }
  });
  // Preflight must complete before parsing (including gateway-added content types).
  // This also puts CORS headers on validation/authentication error responses.
  await app.register(cors, { hook: "onRequest", delegator: async (req: FastifyRequest) => ({
    origin: req.tenant.uiBaseUrl ? new URL(req.tenant.uiBaseUrl).origin : false,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }) });
  await app.register(authPlugin, { env });
  await app.register(registerRoutes, { env });
  return app;
}
