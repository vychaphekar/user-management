import fastifyCors from "@fastify/cors";
import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";

export const corsPlugin: FastifyPluginAsync = fp(async (app) => {
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      // Allow non-browser requests (Postman, curl, server-to-server)
      if (!origin) {
        return cb(null, true);
      }
      // Allow all subdomains of fostercareca.com over HTTPS
      const allowed = /^https:\/\/.*\.fostercareca\.com$/;

      if (allowed.test(origin)) {
        cb(null, true);
      } else {
        cb(new Error("Not allowed by CORS"), false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
});
