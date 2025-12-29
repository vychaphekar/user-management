import { FastifyPluginAsync } from "fastify";
import { parseTenantFromHost } from "../utils/host";
import { TenantRegistry } from "../services/tenantRegistry";
import { Env } from "../config/env";
import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";

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

export const tenantContextPlugin: FastifyPluginAsync<{ env: Env }> = fp(async (app: FastifyInstance, opts: TenantContextOpts) => {
  const { env } = opts;
  const registry = new TenantRegistry(env.AWS_REGION, env.TENANT_TABLE_NAME);

  app.addHook("preHandler", async (req) => {
    const host = req.headers.host || "";
    const tenantSlug = parseTenantFromHost(host);

    if (!tenantSlug) throw app.httpErrors.forbidden("Tenant not found in host");

    const t = await registry.getTenant(tenantSlug);
    if (!t || t.status !== "ACTIVE") throw app.httpErrors.forbidden("Invalid tenant");

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
      profileTableName
    };
  });
});
