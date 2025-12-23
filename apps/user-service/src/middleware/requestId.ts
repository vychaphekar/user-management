import { FastifyPluginAsync } from "fastify";
import crypto from "crypto";

export const requestIdPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (req, reply) => {
    const rid = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    reply.header("x-request-id", rid);
    (req as any).requestId = rid;
  });
};
