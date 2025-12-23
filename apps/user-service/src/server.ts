import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { Env } from "./config/env";
import { requestIdPlugin } from "./middleware/requestId";
import { errorHandler } from "./middleware/errorHandler";
import { tenantContextPlugin } from "./middleware/tenantContext";
import { authPlugin } from "./middleware/auth";
import { registerRoutes } from "./app";

export async function buildServer(env: Env) {
  const app = Fastify({ logger: true });

  await app.register(sensible);
  await app.register(requestIdPlugin);
  app.setErrorHandler(errorHandler);

  await app.register(tenantContextPlugin, { env });
  await app.register(authPlugin);

  await app.register(registerRoutes, { env });

  return app;
}
