import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Env } from "../config/env";
import { CognitoIdp } from "../services/cognitoIdp";
import { accessToken } from "../services/session";
export function mfaHandlers(env: Env) {
  const idp = new CognitoIdp(env.AWS_REGION);
  return {
    async status(req: FastifyRequest, reply: FastifyReply) {
      const out = await idp.getCurrentUser(accessToken(req));
      return reply.send({ enabled: out.UserMFASettingList?.includes("SOFTWARE_TOKEN_MFA") || false });
    },
    async setup(req: FastifyRequest, reply: FastifyReply) {
      const out = await idp.associateSoftwareToken(accessToken(req));
      if (!out.SecretCode) throw req.server.httpErrors.badGateway("Unable to start authenticator setup");
      return reply.send({ secretCode: out.SecretCode });
    },
    async verify(req: FastifyRequest, reply: FastifyReply) {
      const body = z.object({ code: z.string().regex(/^\d{6}$/), deviceName: z.string().max(100).optional() }).strict().parse(req.body);
      const out = await idp.verifySoftwareToken(accessToken(req), body.code, body.deviceName);
      if (out.Status !== "SUCCESS") throw req.server.httpErrors.badRequest("Verification failed");
      return reply.send({ status: "SUCCESS" });
    },
    async preference(req: FastifyRequest, reply: FastifyReply) {
      const body = z.object({ enabled: z.literal(true) }).strict().parse(req.body);
      await idp.setTotpMfa(accessToken(req), body.enabled);
      return reply.send({ ok: true });
    }
  };
}
