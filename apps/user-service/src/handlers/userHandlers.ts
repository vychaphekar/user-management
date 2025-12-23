import { FastifyReply, FastifyRequest } from "fastify";
import { Env } from "../config/env";
import { CognitoIdp } from "../services/cognitoIdp";
import { ProfileStore } from "../services/profileStore";
import { AdminCreateUserSchema, UpdateUserSchema } from "../models/schemas";

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
