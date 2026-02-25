import fastifyCors from "@fastify/cors";
import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";

export const corsPlugin: FastifyPluginAsync = fp(async (app) => {
  await app.register(fastifyCors, {
    origin: [
      "https://app.innovation.fostercareca.com",
      "http://localhost:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
});
