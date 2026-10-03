import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { z } from "zod";
import { Env } from "../config/env";
import { CognitoIdp } from "../services/cognitoIdp";
import { ProfileStore, ProfilePatch, UserProfile } from "../services/profileStore";
import { InviteStore } from "../services/inviteStore";
import { EmailService } from "../services/emailService";
import { signInviteToken } from "../services/inviteToken";
import { publicProfile } from "./authHandlers";
import { BUILTIN_ROLES, effectivePermissions, Permission } from "../services/roleStore";
const Roles = z.array(z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/)).min(1).max(20).refine(v => new Set(v).size === v.length, "Duplicate roles");
const Invite = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), displayName: z.string().trim().min(1).max(150), roles: Roles }).strict();
const Version = z.object({ version: z.number().int().positive() }).strict();
const Patch = z.object({ version: z.number().int().positive(), displayName: z.string().trim().min(1).max(150).optional(), roles: Roles.optional(), status: z.enum(["ACTIVE", "DISABLED"]).optional() }).strict().refine(v => v.displayName !== undefined || v.roles !== undefined || v.status !== undefined, "No changes supplied");
const Params = z.object({ userId: z.string().min(1).max(128) });
const List = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().max(2048).optional(), search: z.string().trim().max(150).default(""), status: z.enum(["INVITED", "ACTIVE", "DISABLED", "DELETED"]).optional() }).strict();
export function userHandlers(env: Env) {
  const idp = new CognitoIdp(env.AWS_REGION);
  const storeFor = (req: FastifyRequest) => new ProfileStore(env.AWS_REGION, req.tenant.profileTableName);
  const actor = (req: FastifyRequest) => { if (!req.user) throw req.server.httpErrors.unauthorized(); return req.user.userId; };
  function requirePermission(req: FastifyRequest, permission: Permission) {
    if (!req.permissions?.includes(permission)) throw req.server.httpErrors.forbidden("You do not have permission to perform this action");
  }
  function validateRoles(req: FastifyRequest, ids: string[]) {
    requirePermission(req, "users.assign_roles");
    const catalog = req.roleCatalog!;
    if (ids.some(id => ![...BUILTIN_ROLES, ...catalog.roles].some(role => role.id === id && role.enabled))) {
      throw req.server.httpErrors.badRequest("Select enabled roles from this organization");
    }
    if (effectivePermissions(ids, catalog).some(permission => !req.permissions?.includes(permission))) {
      throw req.server.httpErrors.forbidden("You cannot grant permissions you do not hold");
    }
  }
  async function get(req: FastifyRequest) {
    const { userId } = Params.parse(req.params); const profile = await storeFor(req).get(req.tenant.tenantId, userId);
    if (!profile) throw req.server.httpErrors.notFound("User not found"); return profile;
  }
  async function sendInvite(req: FastifyRequest, profile: UserProfile) {
    if (!req.tenant.uiBaseUrl || !profile.inviteId || !profile.inviteExpiresAt) throw req.server.httpErrors.serviceUnavailable("Onboarding is not configured");
    const token = signInviteToken(env.INVITE_JWT_SECRET, { tenantId: req.tenant.tenantId, inviteId: profile.inviteId, userId: profile.userId, email: profile.email }, Math.max(1, profile.inviteExpiresAt - Math.floor(Date.now() / 1000)));
    await new InviteStore(env.AWS_REGION, env.INVITE_TABLE_NAME).createInvite({ tenantId: req.tenant.tenantId, inviteId: profile.inviteId, userId: profile.userId, email: profile.email, createdBy: actor(req), expiresAt: profile.inviteExpiresAt });
    const url = new URL("/invite", req.tenant.uiBaseUrl); url.searchParams.set("token", token);
    try { await new EmailService(env.AWS_REGION, env.SES_FROM_EMAIL).sendInvite(profile.email, url.toString()); }
    catch { throw req.server.httpErrors.serviceUnavailable("The account was created, but the invitation email could not be sent. Use Resend invitation on the user record."); }
  }
  const handlers = {
    async list(req: FastifyRequest, reply: FastifyReply) {
      const q = List.parse(req.query); const out = await storeFor(req).list(req.tenant.tenantId, q.limit, q.cursor, q.search, q.status);
      return reply.send({ items: out.items.map(publicProfile), nextCursor: out.nextCursor });
    },
    async get(req: FastifyRequest, reply: FastifyReply) {
      const profile = await get(req); return reply.send({ user: publicProfile(profile), history: await storeFor(req).history(req.tenant.tenantId, profile.userId) });
    },
    async invite(req: FastifyRequest, reply: FastifyReply) {
      const body = Invite.parse(req.body);
      validateRoles(req, body.roles);
      if (!req.tenant.uiBaseUrl) throw req.server.httpErrors.serviceUnavailable("Onboarding is not configured");
      await idp.adminCreateUserSuppressed({ UserPoolId: req.tenant.cognitoUserPoolId, Username: body.email, UserAttributes: [{ Name: "email", Value: body.email }, { Name: "custom:tenantId", Value: req.tenant.tenantId }], MessageAction: "SUPPRESS" });
      const identity = await idp.getUser(req.tenant.cognitoUserPoolId, body.email);
      const userId = identity.UserAttributes?.find(a => a.Name === "sub")?.Value;
      if (!userId) throw req.server.httpErrors.badGateway("Identity service returned an incomplete account");
      const now = new Date().toISOString();
      const profile: UserProfile = { pk: "TENANT#" + req.tenant.tenantId, sk: "USER#" + userId, tenantId: req.tenant.tenantId, userId, email: body.email, displayName: body.displayName, roles: body.roles, status: "INVITED", createdAt: now, updatedAt: now, version: 1, inviteId: randomUUID(), inviteExpiresAt: Math.floor(Date.now() / 1000) + 48 * 3600 };
      await storeFor(req).create(profile, actor(req), req.roleCatalog!.version); await sendInvite(req, profile);
      return reply.code(201).send({ ok: true, user: publicProfile(profile) });
    },
    async resend(req: FastifyRequest, reply: FastifyReply) {
      const body = Version.parse(req.body); const profile = await get(req);
      if (profile.status !== "INVITED") throw req.server.httpErrors.conflict("Only pending invitations can be resent");
      const updated = await storeFor(req).update(req.tenant.tenantId, profile.userId, { inviteId: randomUUID(), inviteExpiresAt: Math.floor(Date.now() / 1000) + 48 * 3600 }, body.version, actor(req), "INVITATION_RESENT");
      await sendInvite(req, updated); return reply.send({ ok: true, user: publicProfile(updated) });
    },
    async update(req: FastifyRequest, reply: FastifyReply) {
      const body = Patch.parse(req.body);
      if (body.displayName !== undefined) requirePermission(req, "users.update");
      if (body.status !== undefined) requirePermission(req, "users.disable");
      if (body.roles !== undefined) validateRoles(req, body.roles);
      const profile = await get(req);
      if (profile.status === "DELETED") throw req.server.httpErrors.conflict("Deleted accounts cannot be edited");
      if (body.status && profile.status === "INVITED") throw req.server.httpErrors.conflict("Accept or revoke the invitation first");
      if (profile.version !== body.version) throw req.server.httpErrors.conflict("This user changed. Refresh before editing.");
      const { version, ...patch } = body;
      // Fail closed if either service is unavailable: enabling Cognito alone never grants API access.
      if (patch.status === "ACTIVE") await idp.enableUser(req.tenant.cognitoUserPoolId, profile.email);
      const updated = await storeFor(req).update(req.tenant.tenantId, profile.userId, patch as ProfilePatch, version, actor(req), "USER_UPDATED", patch.roles ? req.roleCatalog!.version : undefined);
      if (patch.status === "DISABLED") await idp.disableUser(req.tenant.cognitoUserPoolId, profile.email);
      return reply.send(publicProfile(updated));
    },
    async remove(req: FastifyRequest, reply: FastifyReply) {
      const body = Version.parse(req.body); const profile = await get(req);
      const updated = await storeFor(req).update(req.tenant.tenantId, profile.userId, { status: "DELETED" }, body.version, actor(req), profile.status === "INVITED" ? "INVITATION_REVOKED" : "USER_DELETED");
      await idp.disableUser(req.tenant.cognitoUserPoolId, profile.email);
      return reply.send({ ok: true, user: publicProfile(updated) });
    },
    async resetPassword(req: FastifyRequest, reply: FastifyReply) {
      const body = Version.parse(req.body); const profile = await get(req);
      if (profile.status !== "ACTIVE" || profile.version !== body.version) throw req.server.httpErrors.conflict("Refresh and select an active user");
      await idp.resetPassword(req.tenant.cognitoUserPoolId, profile.email);
      await storeFor(req).update(req.tenant.tenantId, profile.userId, {}, profile.version, actor(req), "PASSWORD_RESET_REQUESTED");
      return reply.send({ ok: true });
    },
    async enable(req: FastifyRequest, reply: FastifyReply) { req.body = { ...Version.parse(req.body), status: "ACTIVE" }; return handlers.update(req, reply); },
    async disable(req: FastifyRequest, reply: FastifyReply) { req.body = { ...Version.parse(req.body), status: "DISABLED" }; return handlers.update(req, reply); }
  };
  return { ...handlers, create: handlers.invite };
}
