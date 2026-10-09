import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { errorHandler } from "../src/middleware/errorHandler";

async function respond(raise: (app: ReturnType<typeof Fastify>) => never) {
  const app = Fastify();
  await app.register(sensible);
  app.setErrorHandler(errorHandler);
  app.get("/", async () => raise(app));
  const res = await app.inject({ method: "GET", url: "/" });
  return { status: res.statusCode, body: res.json() };
}

test("a deliberate 503 tells the user what is wrong", async () => {
  const out = await respond(app => { throw app.httpErrors.serviceUnavailable("Onboarding is not configured"); });
  expect(out).toMatchObject({ status: 503, body: { error: "ServiceError", message: "Onboarding is not configured" } });
});

test("an invitation email that cannot be sent says so", async () => {
  const message = "The account was created, but the invitation email could not be sent. Use Resend invitation on the user record.";
  const out = await respond(app => { throw app.httpErrors.serviceUnavailable(message); });
  expect(out).toMatchObject({ status: 503, body: { error: "ServiceError", message } });
});

test("a deliberate 502 tells the user what is wrong", async () => {
  const out = await respond(app => { throw app.httpErrors.badGateway("Unable to start authenticator setup"); });
  expect(out).toMatchObject({ status: 502, body: { message: "Unable to start authenticator setup" } });
});

test("an unexpected 503 from a library keeps the generic message", async () => {
  const out = await respond(() => { throw Object.assign(new Error("ServiceUnavailable: internal host 10.0.0.1"), { name: "ServiceUnavailable", $metadata: { httpStatusCode: 503 } }); });
  expect(out).toMatchObject({ status: 500, body: { message: "Service temporarily unavailable. Try again later." } });
});

test("an unexpected failure keeps the generic message", async () => {
  const out = await respond(() => { throw Object.assign(new Error("AccessDeniedException: arn:aws:..."), { name: "AccessDeniedException" }); });
  expect(out).toMatchObject({ status: 500, body: { message: "Service temporarily unavailable. Try again later." } });
});

test("a mapped error keeps its mapped message", async () => {
  const out = await respond(() => { throw Object.assign(new Error("exists"), { name: "UsernameExistsException" }); });
  expect(out.status).toBe(409);
});
