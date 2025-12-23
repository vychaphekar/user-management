import { buildServer } from "./server";
import { loadEnv } from "./config/env";

async function main() {
  const env = loadEnv();
  const app = await buildServer(env);
  await app.listen({ port: Number(env.PORT), host: "0.0.0.0" });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
