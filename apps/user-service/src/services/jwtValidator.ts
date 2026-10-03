import jwt, { JwtPayload } from "jsonwebtoken";
import jwksClient from "jwks-rsa";

export interface AccessClaims extends JwtPayload { sub: string; client_id: string; token_use: "access"; }
export class JwtValidator {
  private clients = new Map<string, ReturnType<typeof jwksClient>>();
  async verify(token: string, issuer: string, clientId: string): Promise<AccessClaims> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || decoded.header.alg !== "RS256" || !decoded.header.kid) throw new Error("Invalid token");
    let client = this.clients.get(issuer);
    if (!client) {
      client = jwksClient({ jwksUri: issuer + "/.well-known/jwks.json", cache: true, rateLimit: true });
      this.clients.set(issuer, client);
    }
    const key = await client.getSigningKey(decoded.header.kid);
    const claims = jwt.verify(token, key.getPublicKey(), { issuer, algorithms: ["RS256"] });
    if (typeof claims === "string" || claims.token_use !== "access" || claims.client_id !== clientId || !claims.sub || !claims.exp) {
      throw new Error("Invalid token purpose or client");
    }
    return claims as AccessClaims;
  }
}
