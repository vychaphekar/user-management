import jwt from "jsonwebtoken";

export function signInviteToken(secret: string, payload: any, expiresInSeconds: number) {
  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: expiresInSeconds });
}

export function verifyInviteToken(secret: string, token: string) {
  return jwt.verify(token, secret, { algorithms: ["HS256"] }) as any;
}
