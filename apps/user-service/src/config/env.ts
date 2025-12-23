import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.string().default("3000"),
  AWS_REGION: z.string().default("us-east-1"),
  TENANT_TABLE_NAME: z.string(),
  PROFILE_TABLE_NAME: z.string(),
  DEFAULT_USER_POOL_ID: z.string(),
  DEFAULT_USER_POOL_ISSUER: z.string(),
  DEFAULT_APP_CLIENT_ID: z.string(),
  LOG_LEVEL: z.string().default("info")
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid env: ${parsed.error.message}`);
  return parsed.data;
}
