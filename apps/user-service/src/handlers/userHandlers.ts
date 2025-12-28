import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { Env } from "../config/env";
import { CognitoIdp } from "../services/cognitoIdp";
import { ProfileStore } from "../services/profileStore";
import { AdminCreateUserSchema, UpdateUserSchema } from "../models/schemas";

// NEW: invite dependencies (you will add these files)
import { InviteStore } from "../services/inviteStore";
import { EmailService } from "../services/emailService";
import { signInviteToken } from "../services/inviteToken";

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function userHandlers(env: Env) {
  const idp = new CognitoIdp(env.AWS_REGION);

  return {
    async list(req: FastifyRequest, reply: FastifyReply) {
      const tenant = (req as any).tenant;
      const limit = Number((req.query as any)?.limit || 20);
      const cursor = (req.query as any)?.cursor as string | undefined;

      const store = new ProfileStore(env.AWS_REGION, tenant.profileTableName);
      const out = await store.list(tenant.tenantId, limit, cursor);
      return reply.send(out);
    },

    async get(req: FastifyRequest, reply: FastifyReply) {
      const tenant = (req as any).tenant;
      const userId = (req.params as any).userId;

      const store = new ProfileStore(env.AWS_REGION, tenant.profileTableName);
      const profile = await store.get(tenant.tenantId, userId);
      if (!profile) throw (req.server as any).httpErrors.notFound("User not found");
      return reply.send(profile);
    },

    /**
     * Existing create() kept as-is (creates ACTIVE user immediately).
     * You can keep this for internal/admin use or migrate to invite-only.
     */
    async create(req: FastifyRequest, reply: FastifyReply) {
      const tenant = (req as any).tenant;
      const body = AdminCreateUserSchema.parse(req.body);

      await idp.createUser(tenant.cognitoUserPoolId, body.email, body.tempPassword);

      // Ensure tenantId attribute exists for fail-closed PreTokenGeneration
      await idp.updateUser(tenant.cognitoUserPoolId, body.email, { "custom:tenantId": tenant.tenantId });

      const admin = await idp.getUser(tenant.cognitoUserPoolId, body.email);
      const sub = admin.UserAttributes?.find((a) => a.Name === "sub")?.Value || body.email;

      const store = new ProfileStore(env.AWS_REGION, tenant.profileTableName);
      const now = new Date().toISOString();

      await store.create({
        pk: `TENANT#${tenant.tenantId}`,
        sk: `USER#${sub}`,
        tenantId: tenant.tenantId,
        userId: sub,
        email: body.email,
        status: "ACTIVE",
        roles: body.roles.length ? body.roles : ["user"],
        displayName: body.displayName,
        createdAt: now,
        updatedAt: now,
        version: 1
      });

      return reply.status(201).send({ ok: true, userId: sub });
    },

    /**
     * NEW: invite-only onboarding flow (Admin-only route should call this)
     *
     * Requirements implemented:
     * - AdminCreateUser with SUPPRESS (no Cognito email)
     * - profile written as INVITED
     * - invite record stored with TTL (48 hours)
     * - JWT token generated (inviteId + tenantId + email)
     * - SES invite email sent to tenant.uiBaseUrl
     *
     * Env vars required:
     * - INVITE_TABLE_NAME
     * - INVITE_JWT_SECRET
     * - SES_FROM_EMAIL
     * Optional:
     * - INVITE_TTL_HOURS (defaults to 48)
     */
    async invite(req: FastifyRequest, reply: FastifyReply) {
      const tenant = (req as any).tenant;
      const body = AdminCreateUserSchema.parse(req.body); // reuse existing schema (email + roles + displayName + tempPassword)
      const email = body.email.toLowerCase();

      const inviteTable = (env as any).INVITE_TABLE_NAME || process.env.INVITE_TABLE_NAME;
      const inviteSecret = (env as any).INVITE_JWT_SECRET || process.env.INVITE_JWT_SECRET;
      const sesFromEmail = (env as any).SES_FROM_EMAIL || process.env.SES_FROM_EMAIL;
      const ttlHoursRaw = (env as any).INVITE_TTL_HOURS || process.env.INVITE_TTL_HOURS;
      const ttlHours = Number(ttlHoursRaw || 48);

      if (!inviteTable) return reply.code(500).send({ message: "INVITE_TABLE_NAME not configured" });
      if (!inviteSecret) return reply.code(500).send({ message: "INVITE_JWT_SECRET not configured" });
      if (!sesFromEmail) return reply.code(500).send({ message: "SES_FROM_EMAIL not configured" });

      // IMPORTANT: tenant registry must include uiBaseUrl (recommended)
      // Example: https://app.innovation.fostercareca.com
      const uiBaseUrl = tenant.uiBaseUrl;
      if (!uiBaseUrl) {
        return reply.code(500).send({
          message:
            "tenant.uiBaseUrl is missing. Add uiBaseUrl to the tenant registry item so invites can link to the UI."
        });
      }

      // 1) Create user in Cognito without sending Cognito email
      // NOTE: This requires a new CognitoIdp method: adminCreateUserSuppressed()
      // We set email_verified=true because onboarding is controlled by our invite flow.
      await idp.adminCreateUserSuppressed({
        UserPoolId: tenant.cognitoUserPoolId,
        Username: email,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
          { Name: "custom:tenantId", Value: tenant.tenantId }
        ],
        MessageAction: "SUPPRESS"
      });

      // 2) Get Cognito sub (stable userId)
      const createdUser = await idp.getUser(tenant.cognitoUserPoolId, email);
      const sub = createdUser.UserAttributes?.find((a) => a.Name === "sub")?.Value || email;

      // 3) Write INVITED profile
      const store = new ProfileStore(env.AWS_REGION, tenant.profileTableName);
      const nowIso = new Date().toISOString();

      await store.create({
        pk: `TENANT#${tenant.tenantId}`,
        sk: `USER#${sub}`,
        tenantId: tenant.tenantId,
        userId: sub,
        email,
        status: "INVITED",
        roles: body.roles.length ? body.roles : ["user"],
        displayName: body.displayName,
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1
      });

      // 4) Create invite record (one-time + TTL 48 hours)
      const inviteId = randomUUID();
      const expiresAt = nowEpochSeconds() + ttlHours * 60 * 60;

      const inviteStore = new InviteStore(env.AWS_REGION, inviteTable);
      await inviteStore.createInvite({
        tenantId: tenant.tenantId,
        inviteId,
        userId: sub,
        email,
        createdBy: ((req as any).user?.email || (req as any).user?.sub || "admin") as string,
        expiresAt
      });

      // 5) Generate JWT token
      const token = signInviteToken(
        inviteSecret,
        { jti: inviteId, tid: tenant.tenantId, email },
        ttlHours * 60 * 60
      );

      // 6) Send SES invite email
      // B-flow: link lands on API and the API renders the password set page.
      const proto = (req.headers["x-forwarded-proto"] as string) || "https";
      const host = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string);
      const apiBaseUrl = `${proto}://${host}`;
      const inviteUrl = `${apiBaseUrl.replace(/\/$/, "")}/v1/auth/invite/accept?token=${encodeURIComponent(token)}`;

      const emailSvc = new EmailService(env.AWS_REGION, sesFromEmail);
      await emailSvc.sendInvite(email, inviteUrl);

      return reply.status(201).send({
        ok: true,
        userId: sub,
        email,
        inviteId,
        expiresAt
        // You can also return inviteUrl for testing, but avoid exposing in prod:
        // inviteUrl
      });
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
      const tenant = (req as any).tenant;
      const userId = (req.params as any).userId;
      const patch = UpdateUserSchema.parse(req.body);

      const store = new ProfileStore(env.AWS_REGION, tenant.profileTableName);
      const updated = await store.update(tenant.tenantId, userId, patch);

      // Mirror status to Cognito enable/disable (by email)
      if (patch.status === "DISABLED") await idp.disableUser(tenant.cognitoUserPoolId, updated.email);
      if (patch.status === "ACTIVE") await idp.enableUser(tenant.cognitoUserPoolId, updated.email);

      return reply.send(updated);
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
      const tenant = (req as any).tenant;
      const userId = (req.params as any).userId;

      const store = new ProfileStore(env.AWS_REGION, tenant.profileTableName);
      const profile = await store.get(tenant.tenantId, userId);
      if (!profile) throw (req.server as any).httpErrors.notFound("User not found");

      await idp.disableUser(tenant.cognitoUserPoolId, profile.email);
      await store.update(tenant.tenantId, userId, { status: "DELETED" });

      return reply.send({ ok: true });
    },

    async enable(req: FastifyRequest, reply: FastifyReply) {
      const tenant = (req as any).tenant;
      const userId = (req.params as any).userId;

      const store = new ProfileStore(env.AWS_REGION, tenant.profileTableName);
      const profile = await store.get(tenant.tenantId, userId);
      if (!profile) throw (req.server as any).httpErrors.notFound("User not found");

      await idp.enableUser(tenant.cognitoUserPoolId, profile.email);
      const updated = await store.update(tenant.tenantId, userId, { status: "ACTIVE" });
      return reply.send(updated);
    },

    async disable(req: FastifyRequest, reply: FastifyReply) {
      const tenant = (req as any).tenant;
      const userId = (req.params as any).userId;

      const store = new ProfileStore(env.AWS_REGION, tenant.profileTableName);
      const profile = await store.get(tenant.tenantId, userId);
      if (!profile) throw (req.server as any).httpErrors.notFound("User not found");

      await idp.disableUser(tenant.cognitoUserPoolId, profile.email);
      const updated = await store.update(tenant.tenantId, userId, { status: "DISABLED" });
      return reply.send(updated);
    },

    async resetPassword(req: FastifyRequest, reply: FastifyReply) {
      const tenant = (req as any).tenant;
      const userId = (req.params as any).userId;

      const store = new ProfileStore(env.AWS_REGION, tenant.profileTableName);
      const profile = await store.get(tenant.tenantId, userId);
      if (!profile) throw (req.server as any).httpErrors.notFound("User not found");

      const out = await idp.resetPassword(tenant.cognitoUserPoolId, profile.email);
      return reply.send({ ok: true, out });
    }
  };
}
