import jwt, { JwtHeader } from "jsonwebtoken";
import jwksClient from "jwks-rsa";

export class JwtValidator {
  async verify(token: string, issuer: string, audience: string): Promise<any> {
    const decoded = jwt.decode(token, { complete: true }) as { header: JwtHeader; payload: any } | null;
    if (!decoded?.header?.kid) throw new Error("Invalid token header");

    const client = jwksClient({
      jwksUri: `${issuer}/.well-known/jwks.json`,
      cache: true,
      rateLimit: true
    });

    const key = await client.getSigningKey(decoded.header.kid);
    const signingKey = key.getPublicKey();

    return jwt.verify(token, signingKey, { issuer, audience });
  }
}
