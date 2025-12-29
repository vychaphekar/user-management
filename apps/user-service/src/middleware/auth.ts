import { FastifyPluginAsync } from "fastify";
import { JwtValidator } from "../services/jwtValidator";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (req: any, reply: any) => Promise<void>;
    requireRole: (role: string) => (req: any, reply: any) => Promise<void>;
  }
  interface FastifyRequest {
    user?: {
      sub: string;
      claims: any;
      roles: string[];
    };
  }
}

export const authPlugin: FastifyPluginAsync = fp(async (app) => {
  const validator = new JwtValidator();

  app.decorate("requireAuth", async (req: any, _reply: any) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) throw app.httpErrors.unauthorized("Missing Bearer token");

    const { cognitoIssuer, cognitoAppClientId, tenantId } = req.tenant;
    const claims = await validator.verify(token, cognitoIssuer, cognitoAppClientId);

    if (!claims.tenantId) throw app.httpErrors.unauthorized("Missing tenantId claim");
    if (claims.tenantId !== tenantId) throw app.httpErrors.forbidden("Tenant mismatch");

    const rolesRaw = claims.roles;
    let roles: string[] = [];
    if (Array.isArray(rolesRaw)) {
      roles = rolesRaw;
    } else if (typeof rolesRaw === "string") {
      try {
        const parsed = JSON.parse(rolesRaw);
        roles = Array.isArray(parsed) ? parsed : [];
      } catch {
        roles = [];
      }
    }
    if (!roles.length) roles = ["user"];

    req.user = { sub: claims.sub, claims, roles };
  });

  app.decorate("requireRole", (role: string) => async (req: any, reply: any) => {
    // Ensure user is populated even if route forgot to call requireAuth
    if (!req.user) {
      await app.requireAuth(req, reply);
    }
    const roles: string[] = req.user?.roles || [];
    if (!roles.includes(role)) throw app.httpErrors.forbidden("Insufficient role");
  });
});
