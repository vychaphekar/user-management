import { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply) {
  req.log.error({ err }, "request_failed");
  const status = (err as any).statusCode || 500;
  reply.status(status).send({
    error: err.name || "Error",
    message: err.message || "Internal error",
    requestId: (req as any).requestId
  });
}
