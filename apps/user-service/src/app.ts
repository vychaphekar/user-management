import { FastifyInstance } from "fastify";
import { Env } from "./config/env";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { mfaRoutes } from "./routes/mfa";
import { usersRoutes } from "./routes/users";

export async function registerRoutes(app: FastifyInstance, opts: { env: Env }) {
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/v1/auth", env: opts.env });
  await app.register(mfaRoutes, { prefix: "/v1/mfa", env: opts.env });
  await app.register(usersRoutes, { prefix: "/v1/users", env: opts.env });
}
