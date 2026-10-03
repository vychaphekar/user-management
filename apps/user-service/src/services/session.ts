import { FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticationResultType } from "@aws-sdk/client-cognito-identity-provider";

export const ACCESS_COOKIE = "__Host-blueberry-access";
export const REFRESH_COOKIE = "__Host-blueberry-refresh";
const options = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/" };
export function accessToken(req: FastifyRequest): string {
  const auth = req.headers.authorization;
  return auth?.startsWith("Bearer ") ? auth.slice(7) : req.cookies[ACCESS_COOKIE] || "";
}
export function setSession(reply: FastifyReply, result: AuthenticationResultType) {
  if (!result.AccessToken) throw new Error("Missing access token");
  reply.setCookie(ACCESS_COOKIE, result.AccessToken, { ...options, maxAge: result.ExpiresIn || 3600 });
  // Session cookie: Cognito controls the actual refresh-token expiry.
  if (result.RefreshToken) reply.setCookie(REFRESH_COOKIE, result.RefreshToken, options);
  reply.header("Cache-Control", "no-store");
}
export function clearSession(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, options).clearCookie(REFRESH_COOKIE, options);
  reply.header("Cache-Control", "no-store");
}
