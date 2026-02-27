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

      const frontendUrl = "https://app.innovation.fostercareca.com";

      // Allow current production frontend explicitly
      if (origin === frontendUrl) {
        return cb(null, true);
      }

      // Allow future environments: app.<env>.fostercareca.com
      const futureSubdomains = /^https:\/\/app\.[a-z0-9-]+\.fostercareca\.com$/;

      if (futureSubdomains.test(origin)) {
        return cb(null, true);
      }

      cb(new Error("Not allowed by CORS"), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    preflight: true
  });
});
