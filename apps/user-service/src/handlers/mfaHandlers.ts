import { FastifyReply, FastifyRequest } from "fastify";
import { Env } from "../config/env";
import { CognitoIdp } from "../services/cognitoIdp";
import { MfaSetupSchema, MfaVerifySchema, MfaEnableSchema } from "../models/schemas";

export function mfaHandlers(env: Env) {
  const idp = new CognitoIdp(env.AWS_REGION);

  return {
    async setup(req: FastifyRequest, reply: FastifyReply) {
      const body = MfaSetupSchema.parse(req.body);
      const out = await idp.associateSoftwareToken(body.accessToken);
      return reply.send({ secretCode: out.SecretCode, session: out.Session });
    },

    async verify(req: FastifyRequest, reply: FastifyReply) {
      const body = MfaVerifySchema.parse(req.body);
      const out = await idp.verifySoftwareToken(body.accessToken, body.code, body.deviceName);
      return reply.send({ status: out.Status });
    },

    async preference(req: FastifyRequest, reply: FastifyReply) {
      const body = MfaEnableSchema.parse(req.body);
      const out = await idp.setTotpMfa(body.accessToken, body.enabled);
      return reply.send({ ok: true, out });
    }
  };
}
