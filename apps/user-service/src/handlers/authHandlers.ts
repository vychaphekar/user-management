import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import jwt from "jsonwebtoken";
import type { InitiateAuthCommandOutput } from "@aws-sdk/client-cognito-identity-provider";
import { Env } from "../config/env";
import { CognitoIdp } from "../services/cognitoIdp";
import { ProfileStore } from "../services/profileStore";
import { RoleStore, effectivePermissions } from "../services/roleStore";
import { InviteStore } from "../services/inviteStore";
import { verifyInviteToken } from "../services/inviteToken";
import { setSession, clearSession, REFRESH_COOKIE } from "../services/session";
import { EmailOnlySchema, ConfirmForgotSchema, LoginSchema, AcceptInviteSchema, ChallengeSchema, PasswordSchema } from "../models/schemas";

const ChallengeClaims = z.object({ tenantId: z.string(), username: z.string(), challenge: z.enum(["SOFTWARE_TOKEN_MFA", "SMS_MFA", "NEW_PASSWORD_REQUIRED", "MFA_SETUP"]), session: z.string(), setupStarted: z.boolean().optional() });
export function authHandlers(env: Env) {
  const idp = new CognitoIdp(env.AWS_REGION);
  async function activeAccount(req: FastifyRequest, username: string) {
    try {
      const identity = await idp.getUser(req.tenant.cognitoUserPoolId, username);
      const attribute = (name: string) => identity.UserAttributes?.find(value => value.Name === name)?.Value;
      const sub = attribute("sub");
      const identityTenant = attribute("custom:tenantId");
      if (!sub || (identityTenant && identityTenant !== req.tenant.tenantId)) return null;
      const profile = await new ProfileStore(env.AWS_REGION, req.tenant.profileTableName).get(req.tenant.tenantId, sub);
      return profile?.tenantId === req.tenant.tenantId && profile.status === "ACTIVE" &&
        profile.email.toLowerCase() === attribute("email")?.toLowerCase() ? profile : null;
    } catch (error) {
      if (error instanceof Error && error.name === "UserNotFoundException") return null;
      throw error;
    }
  }
  async function finish(req: FastifyRequest, reply: FastifyReply, out: Pick<InitiateAuthCommandOutput, "AuthenticationResult" | "ChallengeName" | "ChallengeParameters" | "Session">, username: string) {
    if (out.ChallengeName) {
      const challenge = ChallengeClaims.shape.challenge.safeParse(out.ChallengeName);
      if (!challenge.success || !out.Session) throw req.server.httpErrors.conflict("This sign-in method requires administrator assistance");
      const challengeToken = jwt.sign({ tenantId: req.tenant.tenantId, username: out.ChallengeParameters?.USER_ID_FOR_SRP || username, challenge: challenge.data, session: out.Session }, env.INVITE_JWT_SECRET, { algorithm: "HS256", audience: "blueberry-challenge", expiresIn: 180 });
      return reply.send({ status: "CHALLENGE", challenge: challenge.data, challengeToken });
    }
    const result = out.AuthenticationResult;
    if (!result?.AccessToken) throw req.server.httpErrors.unauthorized("Unable to complete sign-in");
    const identity = await idp.getCurrentUser(result.AccessToken);
    const sub = identity.UserAttributes?.find(a => a.Name === "sub")?.Value;
    const profile = sub ? await new ProfileStore(env.AWS_REGION, req.tenant.profileTableName).get(req.tenant.tenantId, sub) : null;
    if (!profile || profile.tenantId !== req.tenant.tenantId || profile.status !== "ACTIVE") throw req.server.httpErrors.forbidden("Account is not active in this organization");
    setSession(reply, result);
    const catalog = await new RoleStore(env.AWS_REGION, req.tenant.profileTableName).get(req.tenant.tenantId);
    return reply.send({ status: "AUTHENTICATED", user: { ...publicProfile(profile), permissions: effectivePermissions(profile.roles, catalog) } });
  }
  return {
    async me(req: FastifyRequest, reply: FastifyReply) {
      if (!req.user) throw req.server.httpErrors.unauthorized();
      return reply.send({ user: { ...publicProfile(req.user), permissions: req.permissions || [] } });
    },
    async login(req: FastifyRequest, reply: FastifyReply) {
      const body = LoginSchema.parse(req.body);
      const email = body.email.trim().toLowerCase();
      if (!await activeAccount(req, email)) throw req.server.httpErrors.unauthorized("Invalid credentials or expired session");
      return finish(req, reply, await idp.loginUserPassword(req.tenant.cognitoAppClientId, email, body.password), email);
    },
    async setupChallenge(req: FastifyRequest, reply: FastifyReply) {
      const body = z.object({ challengeToken: z.string().min(20).max(10000) }).strict().parse(req.body);
      const claims = ChallengeClaims.parse(jwt.verify(body.challengeToken, env.INVITE_JWT_SECRET, { algorithms: ["HS256"], audience: "blueberry-challenge" }));
      if (claims.tenantId !== req.tenant.tenantId || claims.challenge !== "MFA_SETUP" || claims.setupStarted) throw req.server.httpErrors.forbidden("Invalid setup challenge");
      if (!await activeAccount(req, claims.username)) throw req.server.httpErrors.unauthorized("Invalid credentials or expired session");
      const out = await idp.associateForChallenge(claims.session);
      if (!out.Session || !out.SecretCode) throw req.server.httpErrors.badGateway("Unable to start authenticator setup");
      const challengeToken = jwt.sign({ ...claims, session: out.Session, setupStarted: true }, env.INVITE_JWT_SECRET, { algorithm: "HS256", audience: "blueberry-challenge", expiresIn: 180 });
      return reply.send({ secretCode: out.SecretCode, challengeToken });
    },
    async challenge(req: FastifyRequest, reply: FastifyReply) {
      const body = ChallengeSchema.parse(req.body);
      const claims = ChallengeClaims.parse(jwt.verify(body.challengeToken, env.INVITE_JWT_SECRET, { algorithms: ["HS256"], audience: "blueberry-challenge" }));
      if (claims.tenantId !== req.tenant.tenantId) throw req.server.httpErrors.forbidden("Challenge belongs to another organization");
      if (!await activeAccount(req, claims.username)) throw req.server.httpErrors.unauthorized("Invalid credentials or expired session");
      if (claims.challenge === "NEW_PASSWORD_REQUIRED") PasswordSchema.parse(body.answer);
      else z.string().regex(/^\d{6}$/).parse(body.answer);
      if (claims.challenge === "MFA_SETUP") {
        if (!claims.setupStarted) throw req.server.httpErrors.badRequest("Start authenticator setup first");
        const verified = await idp.verifyForChallenge(claims.session, body.answer);
        if (verified.Status !== "SUCCESS" || !verified.Session) throw req.server.httpErrors.badRequest("Verification failed");
        return finish(req, reply, await idp.finishMfaSetup(req.tenant.cognitoAppClientId, verified.Session, claims.username), claims.username);
      }
      const out = await idp.respondToChallenge(req.tenant.cognitoAppClientId, claims.challenge, claims.session, claims.username, body.answer);
      return finish(req, reply, out, claims.username);
    },
    async refresh(req: FastifyRequest, reply: FastifyReply) {
      const token = req.cookies[REFRESH_COOKIE];
      if (!token) throw req.server.httpErrors.unauthorized("Session expired. Sign in again.");
      try {
        return await finish(req, reply, await idp.refreshSession(req.tenant.cognitoAppClientId, token), "");
      } catch (error) {
        if (error instanceof Error && ["NotAuthorizedException", "ForbiddenError", "UnauthorizedError"].includes(error.name)) clearSession(reply);
        throw error;
      }
    },
    async logout(req: FastifyRequest, reply: FastifyReply) {
      const token = req.cookies[REFRESH_COOKIE];
      if (token) {
        try { await idp.revokeToken(req.tenant.cognitoAppClientId, token); }
        catch (error) { if (!(error instanceof Error) || error.name !== "NotAuthorizedException") throw error; }
      }
      clearSession(reply);
      return reply.send({ ok: true });
    },
    async acceptInvite(req: FastifyRequest, reply: FastifyReply) {
      if (req.method === "GET") {
        const token = z.object({ token: z.string().min(20) }).parse(req.query).token;
        if (!req.tenant.uiBaseUrl) throw req.server.httpErrors.serviceUnavailable("Onboarding is not configured");
        return reply.redirect(new URL("/invite?token=" + encodeURIComponent(token), req.tenant.uiBaseUrl).toString(), 302);
      }
      const body = AcceptInviteSchema.parse(req.body);
      const claims = verifyInviteToken(env.INVITE_JWT_SECRET, body.token);
      if (claims.tenantId !== req.tenant.tenantId) throw req.server.httpErrors.forbidden("Invitation belongs to another organization");
      const store = new ProfileStore(env.AWS_REGION, req.tenant.profileTableName);
      const profile = await store.get(req.tenant.tenantId, claims.userId);
      if (!profile || profile.status !== "INVITED" || profile.email !== claims.email || profile.inviteId !== claims.inviteId) throw req.server.httpErrors.conflict("Invitation is no longer valid");
      const invitations = new InviteStore(env.AWS_REGION, env.INVITE_TABLE_NAME);
      await invitations.useInviteOnce({ tenantId: claims.tenantId, inviteId: claims.inviteId, nowEpoch: Math.floor(Date.now() / 1000) });
      try {
        await idp.adminSetUserPasswordPermanent(req.tenant.cognitoUserPoolId, claims.email, body.newPassword);
        await idp.updateUser(req.tenant.cognitoUserPoolId, claims.email, { email_verified: "true" });
        await store.activateInvited(req.tenant.tenantId, claims.userId, claims.inviteId, profile.version);
      } catch (error) {
        // Preserve one-time semantics after an uncertain upstream result. Admin can issue a new invitation.
        req.log.warn({ code: error instanceof Error ? error.name : "UpstreamError", requestId: req.id }, "invite_activation_incomplete");
        throw req.server.httpErrors.serviceUnavailable("Account setup could not finish. Ask your administrator to resend the invitation.");
      }
      return reply.send({ ok: true });
    },
    async forgot(req: FastifyRequest, reply: FastifyReply) {
      const body = EmailOnlySchema.parse(req.body);
      try {
        if (await activeAccount(req, body.email.toLowerCase())) {
          await idp.forgotPassword(req.tenant.cognitoAppClientId, body.email.toLowerCase());
        }
      }
      catch (error) { if (!(error instanceof Error) || !["UserNotFoundException", "InvalidParameterException"].includes(error.name)) throw error; }
      return reply.send({ ok: true });
    },
    async confirmForgot(req: FastifyRequest, reply: FastifyReply) {
      const body = ConfirmForgotSchema.parse(req.body);
      if (!await activeAccount(req, body.email.toLowerCase())) throw req.server.httpErrors.badRequest("Unable to reset password. Request a new code from your organization's sign-in page.");
      await idp.confirmForgotPassword(req.tenant.cognitoAppClientId, body.email.toLowerCase(), body.code, body.newPassword);
      return reply.send({ ok: true });
    }
  };
}
export function publicProfile(profile: import("../services/profileStore").UserProfile) {
  return { userId: profile.userId, email: profile.email, displayName: profile.displayName || "", roles: profile.roles, status: profile.status, tenantId: profile.tenantId, createdAt: profile.createdAt, updatedAt: profile.updatedAt, version: profile.version };
}
