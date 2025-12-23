import { FastifyPluginAsync } from "fastify";
import { JwtValidator } from "../services/jwtValidator";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (req: any) => Promise<void>;
    requireRole: (role: string) => (req: any) => Promise<void>;
  }
  interface FastifyRequest {
    user?: {
      sub: string;
      claims: any;
      roles: string[];
    };
  }
}

export const authPlugin: FastifyPluginAsync = async (app) => {
  const validator = new JwtValidator();

  app.decorate("requireAuth", async (req: any) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) throw app.httpErrors.unauthorized("Missing Bearer token");

    const { cognitoIssuer, cognitoAppClientId, tenantId } = req.tenant;
    const claims = await validator.verify(token, cognitoIssuer, cognitoAppClientId);

    // Enforce tenant match (claim injected by PreTokenGeneration Lambda)
    if (!claims.tenantId) throw app.httpErrors.unauthorized("Missing tenantId claim");
    if (claims.tenantId !== tenantId) throw app.httpErrors.forbidden("Tenant mismatch");

    // Parse roles claim (injected as JSON string)
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

  app.decorate("requireRole", (role: string) => async (req: any) => {
    const roles: string[] = req.user?.roles || [];
    if (!roles.includes(role)) throw app.httpErrors.forbidden("Insufficient role");
  });
};
