import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { parseTenantFromHost } from "../utils/host";
import { TenantRegistry } from "../services/tenantRegistry";
import type { Env } from "../config/env";

interface TenantContextOpts {
  env: Env;
}

declare module "fastify" {
  interface FastifyRequest {
    tenant: {
      tenantId: string;
      tenantSlug: string;
      status: "ACTIVE" | "SUSPENDED";
      isolationMode: "LOGICAL" | "DEDICATED_POOL" | "DEDICATED_DB" | "DEDICATED_ACCOUNT";
      cognitoUserPoolId: string;
      cognitoIssuer: string;
      cognitoAppClientId: string;
      profileTableName: string;
    };
  }
}

/**
 * Tenant Context Plugin
 *
 * Resolves tenant from the request host header.
 *
 * IMPORTANT for API Gateway / CloudFront:
 * - The original custom domain host is often provided via `x-forwarded-host`
 *   while `host` may be `*.execute-api.*.amazonaws.com`.
 */
export const tenantContextPlugin: FastifyPluginAsync<{ env: Env }> = fp(
  async (app: FastifyInstance, opts: TenantContextOpts) => {
    const { env } = opts;
    const registry = new TenantRegistry(env.AWS_REGION, env.TENANT_TABLE_NAME);

    app.addHook("preHandler", async (req) => {
      // Prefer forwarded host (API Gateway / CloudFront), fall back to host.
      const rawHost =
        (req.headers["x-forwarded-host"] as string | undefined) ||
        (req.headers["x-forwarded-server"] as string | undefined) ||
        (req.headers.host as string | undefined) ||
        "";

      // Handle multiple values: "a.example.com, b.example.com"
      const firstHost = rawHost.split(",")[0].trim().toLowerCase();

      // Strip port if present: "example.com:443"
      const host = firstHost.split(":")[0];

      const tenantSlug = parseTenantFromHost(host);

      if (!tenantSlug) {
        // Helpful debug info without leaking sensitive data
        req.log.warn(
          { host: req.headers.host, xForwardedHost: req.headers["x-forwarded-host"] },
          "Tenant not found in host headers"
        );
        throw app.httpErrors.forbidden("Tenant not found in host");
      }

      const t = await registry.getTenant(tenantSlug);
      if (!t || t.status !== "ACTIVE") {
        throw app.httpErrors.forbidden("Invalid tenant");
      }

      // Resolve config based on isolation mode, with defaults for LOGICAL
      const userPoolId = t.cognitoUserPoolId || env.DEFAULT_USER_POOL_ID;
      const issuer = t.cognitoIssuer || env.DEFAULT_USER_POOL_ISSUER;
      const appClientId = t.cognitoAppClientId || env.DEFAULT_APP_CLIENT_ID;
      const profileTableName = t.profileTableName || env.PROFILE_TABLE_NAME;

      req.tenant = {
        tenantId: t.tenantId,
        tenantSlug: t.tenantSlug,
        status: t.status,
        isolationMode: t.isolationMode,
        cognitoUserPoolId: userPoolId,
        cognitoIssuer: issuer,
        cognitoAppClientId: appClientId,
        profileTableName,
      };
    });
  }
);

export default tenantContextPlugin;
