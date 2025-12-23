import { buildServer } from "../src/server";
import { loadEnv } from "../src/config/env";

describe("smoke", () => {
  it("rejects without tenant host", async () => {
    process.env.AWS_REGION = "us-east-1";
    process.env.TENANT_TABLE_NAME = "tenant_registry";
    process.env.PROFILE_TABLE_NAME = "user_profiles";
    process.env.DEFAULT_USER_POOL_ID = "pool";
    process.env.DEFAULT_USER_POOL_ISSUER = "https://issuer";
    process.env.DEFAULT_APP_CLIENT_ID = "client";

    const app = await buildServer(loadEnv());
    const res = await app.inject({ method: "GET", url: "/healthz", headers: { host: "api.evanyaconsulting.com" } });
    expect(res.statusCode).toBe(403);
  });
});
