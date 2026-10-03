import jwt from "jsonwebtoken";
import { z } from "zod";
const InviteClaims = z.object({ tenantId: z.string().min(1), inviteId: z.string().uuid(), userId: z.string().min(1), email: z.string().email() });
export type InviteClaims = z.infer<typeof InviteClaims>;
export function signInviteToken(secret: string, payload: InviteClaims, expiresInSeconds: number) {
  return jwt.sign(InviteClaims.parse(payload), secret, { algorithm: "HS256", expiresIn: expiresInSeconds, audience: "blueberry-invitation" });
}
export function verifyInviteToken(secret: string, token: string): InviteClaims {
  return InviteClaims.parse(jwt.verify(token, secret, { algorithms: ["HS256"], audience: "blueberry-invitation" }));
}
