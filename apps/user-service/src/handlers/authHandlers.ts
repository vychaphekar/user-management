import { FastifyReply, FastifyRequest } from "fastify";
import { Env } from "../config/env";
import { CognitoIdp } from "../services/cognitoIdp";
import { ProfileStore } from "../services/profileStore";
import { RegisterSchema, ConfirmSchema, EmailOnlySchema, ConfirmForgotSchema } from "../models/schemas";

export function authHandlers(env: Env) {
  const idp = new CognitoIdp(env.AWS_REGION);

  return {
    async register(req: FastifyRequest, reply: FastifyReply) {
      const body = RegisterSchema.parse(req.body);
      const tenant = (req as any).tenant;

      // Include tenantId as custom attribute (required for PreTokenGeneration -> fail-closed)
      const out = await idp.signUp(tenant.cognitoAppClientId, body.email, body.password, {
        email: body.email,
        "custom:tenantId": tenant.tenantId
      });

      return reply.send({
        userConfirmed: out.UserConfirmed,
        userSub: out.UserSub
      });
    },

    async confirm(req: FastifyRequest, reply: FastifyReply) {
      const body = ConfirmSchema.parse(req.body);
      const tenant = (req as any).tenant;

      await idp.confirmSignUp(tenant.cognitoAppClientId, body.email, body.code);

      // Get sub after confirmation
      const admin = await idp.getUser(tenant.cognitoUserPoolId, body.email);
      const sub = admin.UserAttributes?.find((a) => a.Name === "sub")?.Value || body.email;

      const profileStore = new ProfileStore(env.AWS_REGION, tenant.profileTableName);
      const now = new Date().toISOString();

      await profileStore.create({
        pk: `TENANT#${tenant.tenantId}`,
        sk: `USER#${sub}`,
        tenantId: tenant.tenantId,
        userId: sub,
        email: body.email,
        status: "ACTIVE",
        roles: ["user"],
        createdAt: now,
        updatedAt: now,
        version: 1
      });

      return reply.send({ ok: true });
    },

    async resend(req: FastifyRequest, reply: FastifyReply) {
      const body = EmailOnlySchema.parse(req.body);
      const tenant = (req as any).tenant;
      const out = await idp.resendCode(tenant.cognitoAppClientId, body.email);
      return reply.send({ ok: true, out });
    },

    async forgot(req: FastifyRequest, reply: FastifyReply) {
      const body = EmailOnlySchema.parse(req.body);
      const tenant = (req as any).tenant;
      const out = await idp.forgotPassword(tenant.cognitoAppClientId, body.email);
      return reply.send({ ok: true, out });
    },

    async confirmForgot(req: FastifyRequest, reply: FastifyReply) {
      const body = ConfirmForgotSchema.parse(req.body);
      const tenant = (req as any).tenant;
      const out = await idp.confirmForgotPassword(tenant.cognitoAppClientId, body.email, body.code, body.newPassword);
      return reply.send({ ok: true, out });
    }
  };
}
