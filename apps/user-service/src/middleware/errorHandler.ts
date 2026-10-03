import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply) {
  const mapped: Record<string, [number, string]> = {
    NotAuthorizedException: [401, "Invalid credentials or expired session"],
    UserNotFoundException: [401, "Invalid credentials or expired session"],
    UsernameExistsException: [409, "An account already exists. Use its existing invitation or account actions."],
    TransactionCanceledException: [409, "This record changed. Refresh and try again."],
    ConditionalCheckFailedException: [409, "This record changed or the link is no longer valid. Refresh and try again."],
    CodeMismatchException: [400, "Incorrect verification code"],
    ExpiredCodeException: [400, "Verification code expired. Request a new code."],
    InvalidPasswordException: [400, "Password does not meet the configured policy"],
    TooManyRequestsException: [429, "Too many attempts. Try again later."],
    LimitExceededException: [429, "Too many attempts. Try again later."],
    TokenExpiredError: [400, "Invitation expired. Ask an administrator for a new invitation."],
    JsonWebTokenError: [400, "Invalid invitation"],
  };
  const entry = err instanceof ZodError ? [400, "Please check the submitted fields"] as const : mapped[err.name];
  const status = entry?.[0] || (err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500);
  // Never log request bodies, token-bearing URLs, upstream messages or personal records.
  req.log[status >= 500 ? "error" : "warn"]({ code: err.name, status, requestId: req.id }, "request_failed");
  reply.status(status).send({ error: status >= 500 ? "ServiceError" : "RequestError", message: entry?.[1] || (status >= 500 ? "Service temporarily unavailable. Try again later." : err.message), requestId: req.id });
}
