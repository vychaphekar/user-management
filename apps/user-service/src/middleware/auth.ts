import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { JwtValidator } from "../services/jwtValidator";
import { ProfileStore, UserProfile } from "../services/profileStore";
import { CognitoIdp } from "../services/cognitoIdp";
import { accessToken } from "../services/session";
import { Env } from "../config/env";
import { RoleStore, Permission, RoleCatalog, effectivePermissions } from "../services/roleStore";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (role: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (permission: Permission) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest { user?: UserProfile; permissions?: Permission[]; roleCatalog?: RoleCatalog; }
}
export const authPlugin: FastifyPluginAsync<{ env: Env }> = fp(async (app: FastifyInstance, { env }: { env: Env }) => {
  const validator = new JwtValidator();
  const idp = new CognitoIdp(env.AWS_REGION);
  app.decorate("requireAuth", async (req: FastifyRequest) => {
    const token = accessToken(req);
    if (!token) throw app.httpErrors.unauthorized("Sign in required");
    let sub: string;
    try {
      const claims = await validator.verify(token, req.tenant.cognitoIssuer, req.tenant.cognitoAppClientId);
      // Cognito checks revocation, unlike signature verification alone.
      const identity = await idp.getCurrentUser(token);
      if (identity.UserAttributes?.find(a => a.Name === "sub")?.Value !== claims.sub) throw new Error("Identity mismatch");
      sub = claims.sub;
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (["TooManyRequestsException", "InternalErrorException", "TimeoutError"].includes(name)) throw app.httpErrors.serviceUnavailable("Authentication service unavailable");
      throw app.httpErrors.unauthorized("Session expired or invalid");
    }
    // Current database roles/status are authoritative; stale token roles cannot retain privileges.
    const profile = await new ProfileStore(env.AWS_REGION, req.tenant.profileTableName).get(req.tenant.tenantId, sub);
    if (!profile || profile.tenantId !== req.tenant.tenantId || profile.status !== "ACTIVE") {
      throw app.httpErrors.forbidden("Account is not active in this organization");
    }
    req.user = profile;
    req.roleCatalog = await new RoleStore(env.AWS_REGION, req.tenant.profileTableName).get(req.tenant.tenantId);
    req.permissions = effectivePermissions(profile.roles, req.roleCatalog);
  });
  app.decorate("requirePermission", (permission: Permission) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) await app.requireAuth(req, reply);
    if (!req.permissions?.includes(permission)) throw app.httpErrors.forbidden("You do not have permission to perform this action");
  });
  app.decorate("requireRole", (role: string) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) await app.requireAuth(req, reply);
    if (!req.user?.roles.includes(role)) throw app.httpErrors.forbidden("You do not have permission to perform this action");
  });
});
